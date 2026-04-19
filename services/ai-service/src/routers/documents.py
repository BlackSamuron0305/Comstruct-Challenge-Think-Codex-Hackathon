"""Document extraction router — PDF/Excel/Image AI processing.

Provides:
- POST /ai/extract-pdf — extract structured data from PDF invoices/quotes
- POST /ai/extract-excel — parse Excel price lists with AI column mapping
- POST /ai/extract-image — OCR image and extract product data
- POST /ai/extract-text — extract key info from freeform text (e.g. WhatsApp messages)

All extraction endpoints run delta detection against the catalog DB to flag
price changes vs new entries.
"""
import base64
import logging
import re

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel

from ..config import settings
from ..dependencies import require_internal_secret
from ..llm.ollama_client import call_ollama_json, call_ollama_vision
from ..services.delta_detection import detect_deltas
from ..services.parsing import (
    DEFAULT_PAGE_OVERLAP,
    DEFAULT_PAGES_PER_CHUNK,
    build_markdown_chunks,
    extract_catalog_from_markdown,
    parse_image_to_table,
    parse_pdf_to_markdown_pages,
    parse_pdf_to_table,
    parse_tabular,
)
from ..services.upload_validation import (
    SUPPORTED_DOCUMENT_EXTENSIONS,
    SUPPORTED_DOCUMENT_TYPES,
    SUPPORTED_IMAGE_EXTENSIONS,
    validate_uploaded_file,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["documents"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/tiff", "image/bmp"}
MAX_DOC_SIZE = 50 * 1024 * 1024  # 50 MB


class ExtractionResult(BaseModel):
    status: str
    items: list[dict]
    deltas: list[dict]
    delta_summary: dict
    metadata: dict
    raw_row_count: int


async def _run_delta_detection(items: list[dict], supplier_id: str | None = None) -> tuple[list[dict], dict]:
    """Run delta detection and return (deltas, summary)."""
    if not items:
        return [], {"total": 0, "new_entries": 0, "price_changes": 0, "unchanged": 0, "skipped": 0}
    try:
        deltas = await detect_deltas(items, supplier_id=supplier_id)
        summary = {
            "total": len(deltas),
            "new_entries": sum(1 for d in deltas if d.get("delta_type") == "new_entry"),
            "price_changes": sum(1 for d in deltas if d.get("delta_type") == "price_change"),
            "unchanged": sum(1 for d in deltas if d.get("delta_type") == "unchanged"),
            "skipped": sum(1 for d in deltas if d.get("delta_type") == "skipped"),
        }
        return deltas, summary
    except Exception as e:
        logger.warning("Delta detection failed: %s", e)
        return [], {"error": str(e)}


def _fallback_itemise_rows(rows: list[dict], default_currency: str = "CHF") -> list[dict]:
    items: list[dict] = []
    for row in rows[:10]:
        values = [str(value).strip() for value in row.values() if str(value).strip()]
        if not values:
            continue
        items.append({
            "name": values[0],
            "sku": values[1] if len(values) > 1 else "",
            "quantity": 1,
            "unit": "pc",
            "unit_price": None,
            "currency": default_currency,
            "category": "Uncategorised",
            "raw": row,
        })
    return items


def _merge_extracted_items(items: list[dict]) -> list[dict]:
    merged: dict[tuple[str, str], dict] = {}
    for item in items:
        name = str(item.get("name") or "").strip()
        sku = str(item.get("sku") or "").strip()
        if not name and not sku:
            continue
        key = (sku.lower(), name.lower())
        existing = merged.get(key)
        if existing is None:
            merged[key] = dict(item)
            continue
        for field, value in item.items():
            if existing.get(field) in (None, "", [], {}) and value not in (None, "", [], {}):
                existing[field] = value
        if (item.get("quantity") or 0) > (existing.get("quantity") or 0):
            existing["quantity"] = item.get("quantity")
    return list(merged.values())


_MANDATORY_SUPPLIER_PATTERNS = [
    re.compile(r"(?:must|shall|required to)\s+(?:be\s+)?(?:purchased|ordered|procured|sourced|bought)\s+(?:exclusively\s+)?from\s+(?P<supplier>[A-Z][A-Za-z0-9&.,'’\- ]{2,80})", re.IGNORECASE),
    re.compile(r"(?:only|exclusively)\s+from\s+(?P<supplier>[A-Z][A-Za-z0-9&.,'’\- ]{2,80})", re.IGNORECASE),
    re.compile(r"(?:mandatory supplier|mandatory buy(?:ing)? source)\s*(?:is|:)?\s*(?P<supplier>[A-Z][A-Za-z0-9&.,'’\- ]{2,80})", re.IGNORECASE),
]

_PREFERRED_SUPPLIER_PATTERNS = [
    re.compile(r"(?:preferred supplier|framework contract supplier|framework agreement supplier)\s*(?:is|:)?\s*(?P<supplier>[A-Z][A-Za-z0-9&.,'’\- ]{2,80})", re.IGNORECASE),
]


def _clean_supplier_name(value: str | None) -> str | None:
    if not value:
        return None
    name = re.sub(r"\s+", " ", value).strip(" .,:;\n\t")
    lower = name.lower()
    for marker in (" under ", " for ", " because ", " due to ", " with "):
        idx = lower.find(marker)
        if idx > 0:
            name = name[:idx].strip(" .,:;")
            break
    return name or None


def _detect_procurement_constraints(
    text: str,
    *,
    default_supplier: str | None = None,
    document_type: str | None = None,
) -> dict:
    raw = text or ""
    lowered = raw.lower()
    supplier_name = _clean_supplier_name(default_supplier)
    binding = "none"
    reason = None

    for pattern in _MANDATORY_SUPPLIER_PATTERNS:
        match = pattern.search(raw)
        if match:
            supplier_name = _clean_supplier_name(match.group("supplier")) or supplier_name
            binding = "mandatory_supplier"
            reason = "Document contains a mandatory purchase clause tied to a supplier."
            break

    if binding == "none":
        for pattern in _PREFERRED_SUPPLIER_PATTERNS:
            match = pattern.search(raw)
            if match:
                supplier_name = _clean_supplier_name(match.group("supplier")) or supplier_name
                binding = "preferred_supplier"
                reason = "Document references a preferred or framework supplier."
                break

    if binding == "none" and any(keyword in lowered for keyword in (
        "mandatory buy",
        "mandatory supplier",
        "exclusive supplier",
        "must be purchased from",
        "must be ordered from",
        "exclusively from",
        "only from",
    )):
        binding = "mandatory_supplier"
        reason = "Document contains a supplier-lock clause."

    if binding == "none" and any(keyword in lowered for keyword in (
        "framework contract",
        "framework agreement",
        "preferred supplier",
    )):
        binding = "preferred_supplier"
        reason = "Document references a framework or preferred-supplier arrangement."

    source_locked = binding == "mandatory_supplier"
    result = {
        "source_locked": source_locked,
        "contract_binding": binding,
        "mandatory_supplier_name": supplier_name if source_locked else None,
        "preferred_supplier_name": supplier_name if binding in {"mandatory_supplier", "preferred_supplier"} else None,
        "mandatory_reason": reason,
    }
    if document_type:
        result["document_type"] = document_type
    return result


def _apply_procurement_constraints(items: list[dict], metadata: dict) -> list[dict]:
    if not items:
        return items

    binding = metadata.get("contract_binding")
    preferred_name = metadata.get("preferred_supplier_name") or metadata.get("mandatory_supplier_name")
    source_locked = bool(metadata.get("source_locked"))
    if binding in (None, "none") and not preferred_name and not source_locked:
        return items

    enriched: list[dict] = []
    for item in items:
        row = dict(item)
        if binding not in (None, "none"):
            row["procurement_constraint"] = binding
        if preferred_name:
            row["preferred_supplier_name"] = preferred_name
        if source_locked:
            row["required_supplier_name"] = preferred_name
            row["source_locked"] = True
        enriched.append(row)
    return enriched


async def _extract_pdf_chunk_with_retry(
    markdown: str,
    *,
    document_type: str,
    page_range: str,
    default_currency: str = "CHF",
    max_attempts: int = 2,
) -> dict:
    deterministic_items = extract_catalog_from_markdown(markdown)
    procurement_meta = _detect_procurement_constraints(markdown, document_type=document_type)
    stub = {
        "items": _apply_procurement_constraints(deterministic_items, procurement_meta),
        "metadata": {
            "document_type": document_type,
            "page_range": page_range,
            "note": "Fallback extraction from markdown chunk",
            **procurement_meta,
        },
    }

    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            result = await call_ollama_json(
                system=f"""You are a precision document extraction AI for Swiss construction materials procurement.
You will receive markdown converted from PDF pages {page_range} of a {document_type}.

EXTRACTION RULES:
1. Extract EVERY line item (Pos), including items marked as "Alternative Position" — set is_alternative=true for those.
2. unit_price must be the NET price per unit after all adjustments — use the unit price value shown directly in the document (labelled "Einheitspreis netto" or the net unit price column); do NOT derive it by dividing the line total by quantity, as that introduces rounding errors.
3. For "Rabatt" (discount) items: set base_discount_pct to the discount percentage (e.g. 52.0 for 52%).
4. For "TZ Zuschlag" (surcharge) items: set surcharge_pct to the surcharge percentage (e.g. 3.0 for 3%) — this is a positive addition to the list price.
5. list_price is the gross price before Rabatt/TZ, if shown.
6. Capture special_info as a JSON object with any extra attributes present on the item:
   - npk_code: the NPK position code (e.g. "151.412.211")
   - rabattgruppe: the discount group code (e.g. "45001")
   - manufacturer_ref: any manufacturer or cross-reference code (e.g. "Swisscom 1337435")
   - dimensions: any size/dimension info not captured in the name (e.g. "D 100 cm d1 60 cm H 100 cm W 12 cm")
   - article_ref: any "Artikel XXXXXX CREA" or similar reference
   - notes: any free-text notes on the position
7. category should use English construction terms (e.g. "cable conduit", "cable protection fitting", "manhole ring", "manhole cover", "warning tape", "cable pulling rope", "concrete pipe", "cable shaft", "paving stone", "stone slab").
8. Do NOT invent values. Use null for anything not explicitly shown.
9. If a line item spans a page break, merge it using the overlapping context.

Return JSON:
{{
  "items": [{{
    "name": "...",
    "sku": "...",
    "quantity": <number>,
    "unit": "...",
    "unit_price": <net price per unit, number>,
    "list_price": <gross price before discount/surcharge, number or null>,
    "base_discount_pct": <discount % as number e.g. 52.0, or null>,
    "surcharge_pct": <TZ surcharge % as number e.g. 3.0, or null>,
    "currency": "{default_currency}",
    "category": "...",
    "is_alternative": <true if this is an Alternative Position, else false>,
    "alternative_to_pos": <pos number this is an alternative to, or null>,
    "procurement_constraint": "none",
    "required_supplier_name": null,
    "special_info": {{
      "npk_code": "...",
      "rabattgruppe": "...",
      "manufacturer_ref": "...",
      "dimensions": "...",
      "article_ref": "...",
      "notes": "..."
    }}
  }}],
  "metadata": {{
    "supplier_name": <null if not shown>,
    "document_date": "YYYY-MM-DD",
    "document_number": "...",
    "valid_until": "YYYY-MM-DD or null",
    "delivery_date": "YYYY-MM-DD or null",
    "total_amount": <subtotal excl. VAT, number>,
    "vat_rate": <VAT % as number e.g. 8.1, or null>,
    "vat_amount": <VAT amount or null>,
    "total_with_vat": <grand total incl. VAT or null>,
    "weight_kg": <total weight in kg or null>,
    "payment_terms": "...",
    "currency": "{default_currency}",
    "page_range": "{page_range}",
    "source_locked": false,
    "contract_binding": "none|preferred_supplier|mandatory_supplier",
    "mandatory_supplier_name": null,
    "mandatory_reason": null
  }}
}}

Also detect framework-contract language (mandatory-buy, exclusive supplier, preferred supplier, only-from-supplier clauses) and set contract_binding/mandatory_supplier_name accordingly.""",
                messages=[{"role": "user", "content": f"Markdown chunk from pages {page_range}:\n\n{markdown}"}],
                max_tokens=4096,
                temperature=0.0,
                stub=stub,
            )
            if isinstance(result, dict):
                return result
        except Exception as e:
            last_error = e
            logger.warning("PDF chunk extraction failed for %s on attempt %s/%s: %s", page_range, attempt, max_attempts, e)

    if last_error is not None:
        stub["metadata"]["warning"] = f"retry_exhausted: {last_error}"
    return stub


@router.post("/extract-pdf", response_model=ExtractionResult, dependencies=[Depends(require_internal_secret)])
async def extract_pdf(
    file: UploadFile = File(...),
    document_type: str = Form("invoice"),
    supplier_id: str = Form(""),
):
    """Extract structured data from a PDF document using markdown-first chunked AI."""
    content = await file.read()
    validate_uploaded_file(
        file,
        content,
        allowed_content_types={"application/pdf"},
        allowed_extensions={".pdf"},
        max_size=MAX_DOC_SIZE,
    )
    df = parse_pdf_to_table(content)
    page_markdowns = parse_pdf_to_markdown_pages(content)
    markdown_chunks = build_markdown_chunks(
        page_markdowns,
        pages_per_chunk=DEFAULT_PAGES_PER_CHUNK,
        overlap_pages=DEFAULT_PAGE_OVERLAP,
    )

    if df.empty and not markdown_chunks:
        return ExtractionResult(
            status="empty", items=[], deltas=[], delta_summary={}, metadata={"document_type": document_type}, raw_row_count=0,
        )

    items: list[dict] = []
    metadata: dict = {
        "document_type": document_type,
        "page_count": len(page_markdowns),
        "chunk_count": len(markdown_chunks),
        "pages_per_chunk": DEFAULT_PAGES_PER_CHUNK,
        "page_overlap": DEFAULT_PAGE_OVERLAP,
        "chunk_ranges": [f"{chunk['start_page']}-{chunk['end_page']}" for chunk in markdown_chunks],
        "extraction_mode": "markdown_chunked",
    }

    for chunk in markdown_chunks:
        page_range = f"{chunk['start_page']}-{chunk['end_page']}"
        result = await _extract_pdf_chunk_with_retry(
            chunk["markdown"],
            document_type=document_type,
            page_range=page_range,
        )
        items.extend(result.get("items", []))
        chunk_metadata = result.get("metadata", {})
        for field in ("supplier_name", "document_date", "document_number", "total_amount", "currency"):
            if chunk_metadata.get(field) and not metadata.get(field):
                metadata[field] = chunk_metadata[field]

    items = _merge_extracted_items(items)
    procurement_meta = _detect_procurement_constraints(
        "\n\n".join(chunk.get("markdown", "") for chunk in markdown_chunks),
        default_supplier=metadata.get("supplier_name"),
        document_type=document_type,
    )
    metadata.update({k: v for k, v in procurement_meta.items() if v not in (None, "none") or k in {"source_locked", "contract_binding"}})
    items = _apply_procurement_constraints(items, metadata)

    if not items and not df.empty:
        sample = df.head(20).to_dict(orient="records")
        columns = list(df.columns)
        result = await call_ollama_json(
            system=f"""You are a document extraction AI for construction materials procurement.
Extract structured data from this {document_type} PDF content.
The table has columns: {columns}

Return JSON: {{
  "items": [{{"name": "...", "sku": "...", "quantity": ..., "unit": "...", "unit_price": ..., "currency": "CHF", "category": "..."}}],
  "metadata": {{"supplier_name": "...", "document_date": "...", "document_number": "...", "total_amount": ..., "currency": "CHF"}}
}}""",
            messages=[{"role": "user", "content": f"Document rows:\n{sample}"}],
            max_tokens=2048,
            temperature=0.0,
            stub={
                "items": _fallback_itemise_rows(sample, "CHF"),
                "metadata": {"document_type": document_type, "note": "Fallback extraction from parsed table rows"},
            },
        )
        items = _merge_extracted_items(result.get("items", []))
        metadata.update(result.get("metadata", {}))
        metadata.update(_detect_procurement_constraints(str(sample), default_supplier=metadata.get("supplier_name"), document_type=document_type))
        items = _apply_procurement_constraints(items, metadata)
        metadata["extraction_mode"] = "table_ai_fallback"

    deltas, delta_summary = await _run_delta_detection(items, supplier_id=supplier_id or None)

    return ExtractionResult(
        status="ok",
        items=items,
        deltas=deltas,
        delta_summary=delta_summary,
        metadata=metadata,
        raw_row_count=len(df),
    )


@router.post("/extract-excel", response_model=ExtractionResult, dependencies=[Depends(require_internal_secret)])
async def extract_excel(
    file: UploadFile = File(...),
    supplier_id: str = Form(""),
    default_currency: str = Form("CHF"),
):
    """Extract structured product data from an Excel/CSV file."""
    content = await file.read()
    validate_uploaded_file(
        file,
        content,
        allowed_content_types=SUPPORTED_DOCUMENT_TYPES,
        allowed_extensions=SUPPORTED_DOCUMENT_EXTENSIONS,
        max_size=MAX_DOC_SIZE,
    )
    filename = file.filename or "upload.xlsx"
    df = parse_tabular(filename, content)

    if df.empty:
        return ExtractionResult(
            status="empty", items=[], deltas=[], delta_summary={}, metadata={}, raw_row_count=0,
        )

    sample = df.head(20).to_dict(orient="records")
    columns = list(df.columns)

    result = await call_ollama_json(
        system=f"""You are a data extraction AI for construction material price lists.
Map the columns to standard fields and extract product data.
Source columns: {columns}

Return JSON: {{
  "items": [{{"name": "...", "sku": "...", "unit_price": ..., "currency": "{default_currency}", "unit": "...", "category": "...", "manufacturer": "...", "required_supplier_name": null, "procurement_constraint": "none|preferred_supplier|mandatory_supplier"}}],
  "metadata": {{"column_mapping": {{}}, "supplier_id": "{supplier_id}", "source_locked": false, "contract_binding": "none|preferred_supplier|mandatory_supplier", "mandatory_supplier_name": null}}
}}
If the sheet or notes indicate mandatory-buy or exclusive-supplier obligations, capture that in metadata.""",
        messages=[{"role": "user", "content": f"Excel data sample:\n{sample}"}],
        max_tokens=2048,
        temperature=0.0,
        stub={
            "items": _fallback_itemise_rows(sample, default_currency),
            "metadata": {"supplier_id": supplier_id, "note": "Fallback extraction from spreadsheet rows"},
        },
    )

    metadata = result.get("metadata", {})
    metadata.update(_detect_procurement_constraints(str(sample), default_supplier=metadata.get("supplier_name")))
    items = _apply_procurement_constraints(result.get("items", []), metadata)
    deltas, delta_summary = await _run_delta_detection(items, supplier_id=supplier_id or None)

    return ExtractionResult(
        status="ok",
        items=items,
        deltas=deltas,
        delta_summary=delta_summary,
        metadata=metadata,
        raw_row_count=len(df),
    )


@router.post("/extract-image", response_model=ExtractionResult, dependencies=[Depends(require_internal_secret)])
async def extract_image(
    file: UploadFile = File(...),
    document_type: str = Form("price_list"),
    supplier_id: str = Form(""),
    default_currency: str = Form("CHF"),
):
    """Extract structured data from an image (photo of invoice, price list, delivery note) using OCR + AI."""
    content = await file.read()
    validate_uploaded_file(
        file,
        content,
        allowed_content_types=ALLOWED_IMAGE_TYPES,
        allowed_extensions=SUPPORTED_IMAGE_EXTENSIONS,
        max_size=MAX_DOC_SIZE,
    )

    if settings.LLM_PROVIDER == "openai" and settings.OPENAI_API_KEY:
        try:
            vision_result = await call_ollama_vision(
                system=f"""You are a document OCR and extraction AI for construction materials procurement.
Read the uploaded {document_type} image directly and extract only information that is actually visible.
Be especially accurate with supplier names, quantities, units, prices, and any preferred or mandatory supplier clauses.

Return JSON: {{
  "items": [{{"name": "...", "sku": "...", "quantity": ..., "unit": "...", "unit_price": ..., "currency": "{default_currency}", "category": "...", "required_supplier_name": null, "procurement_constraint": "none|preferred_supplier|mandatory_supplier"}}],
  "metadata": {{"supplier_name": "...", "document_date": "...", "document_number": "...", "ocr_quality": "good|fair|poor", "source_locked": false, "contract_binding": "none|preferred_supplier|mandatory_supplier", "mandatory_supplier_name": null}}
}}""",
                user_message="Extract the document contents from this image and return structured JSON.",
                image_b64=base64.b64encode(content).decode("utf-8"),
                max_tokens=2048,
                temperature=0.0,
                stub={"items": [], "metadata": {"document_type": document_type, "ocr": "vision_unavailable"}},
                content_type=file.content_type or "image/jpeg",
            )
            metadata = {"document_type": document_type, **(vision_result.get("metadata", {}) or {})}
            metadata.update(_detect_procurement_constraints(str(vision_result), default_supplier=metadata.get("supplier_name"), document_type=document_type))
            items = _apply_procurement_constraints(vision_result.get("items", []), metadata)
            if items:
                metadata["ocr"] = "openai_vision"
                deltas, delta_summary = await _run_delta_detection(items, supplier_id=supplier_id or None)
                return ExtractionResult(
                    status="ok",
                    items=items,
                    deltas=deltas,
                    delta_summary=delta_summary,
                    metadata=metadata,
                    raw_row_count=len(items),
                )
        except Exception as e:
            logger.warning("OpenAI vision OCR failed for image extraction, falling back to local OCR: %s", e)

    df = parse_image_to_table(content)

    if df.empty:
        return ExtractionResult(
            status="empty", items=[], deltas=[], delta_summary={},
            metadata={"document_type": document_type, "ocr": "no_text_detected"}, raw_row_count=0,
        )

    sample = df.head(30).to_dict(orient="records")

    result = await call_ollama_json(
        system=f"""You are a document extraction AI for construction materials procurement.
Extract structured product data from this OCR text captured from a {document_type} image.
The text may have OCR artifacts — be tolerant of typos and misaligned columns.
Only extract values supported by the OCR lines. Use null for missing values instead of guessing.

Return JSON: {{
  "items": [{{"name": "...", "sku": "...", "quantity": ..., "unit": "...", "unit_price": ..., "currency": "{default_currency}", "category": "...", "required_supplier_name": null, "procurement_constraint": "none|preferred_supplier|mandatory_supplier"}}],
  "metadata": {{"supplier_name": "...", "document_date": "...", "document_number": "...", "ocr_quality": "good|fair|poor", "source_locked": false, "contract_binding": "none|preferred_supplier|mandatory_supplier", "mandatory_supplier_name": null}}
}}
If the OCR text mentions exclusive supplier or mandatory-buy clauses, preserve them in metadata.""",
        messages=[{"role": "user", "content": f"OCR text lines:\n{sample}"}],
        max_tokens=2048,
        temperature=0.0,
        stub={
            "items": _fallback_itemise_rows(sample, default_currency),
            "metadata": {"document_type": document_type, "ocr": "processed", "note": "Fallback extraction from OCR rows"},
        },
    )

    metadata = result.get("metadata", {})
    metadata.update(_detect_procurement_constraints(str(sample), default_supplier=metadata.get("supplier_name"), document_type=document_type))
    items = _apply_procurement_constraints(result.get("items", []), metadata)
    deltas, delta_summary = await _run_delta_detection(items, supplier_id=supplier_id or None)

    return ExtractionResult(
        status="ok",
        items=items,
        deltas=deltas,
        delta_summary=delta_summary,
        metadata=metadata,
        raw_row_count=len(df),
    )


class TextExtractionRequest(BaseModel):
    text: str
    extraction_type: str = "order"


@router.post("/extract-text", dependencies=[Depends(require_internal_secret)])
async def extract_text(body: TextExtractionRequest):
    """Extract structured procurement data from freeform text (WhatsApp, email, voice transcripts)."""
    result = await call_ollama_json(
        system=f"""You are a text extraction AI for construction procurement.
Extract structured data from this {body.extraction_type} text.
Look for: material names, quantities, units, prices, dates, supplier names, addresses, and any framework-contract clauses.
If the text says a product must be bought only from a specific supplier, mark that as a mandatory supplier binding.

Return JSON: {{
  "items": [{{"name": "...", "quantity": ..., "unit": "...", "estimated_price": ..., "currency": "CHF", "required_supplier_name": null, "procurement_constraint": "none|preferred_supplier|mandatory_supplier"}}],
  "metadata": {{"sender": "...", "date": "...", "urgency": "low|medium|high", "project_reference": "...", "source_locked": false, "contract_binding": "none|preferred_supplier|mandatory_supplier", "mandatory_supplier_name": null, "mandatory_reason": null}},
  "summary": "Brief summary in the source language"
}}""",
        messages=[{"role": "user", "content": body.text}],
        max_tokens=1024,
        temperature=0.0,
        stub={
            "items": [{
                "name": body.text[:80].strip(),
                "quantity": 1,
                "unit": "pc",
                "estimated_price": None,
                "currency": "CHF",
            }] if body.text.strip() else [],
            "metadata": {"extraction_type": body.extraction_type, "chars": len(body.text)},
            "summary": f"Fallback extraction generated from {len(body.text.split())} words of source text.",
        },
    )
    metadata = result.get("metadata", {}) if isinstance(result, dict) else {}
    metadata.update(_detect_procurement_constraints(body.text, default_supplier=metadata.get("sender"), document_type=body.extraction_type))
    items = _apply_procurement_constraints(result.get("items", []), metadata) if isinstance(result, dict) else []
    return {
        **(result if isinstance(result, dict) else {}),
        "items": items,
        "metadata": metadata,
    }
