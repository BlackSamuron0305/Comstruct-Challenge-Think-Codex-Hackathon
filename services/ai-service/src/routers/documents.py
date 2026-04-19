"""Document extraction router — PDF/Excel/Image AI processing.

Provides:
- POST /ai/extract-pdf — extract structured data from PDF invoices/quotes
- POST /ai/extract-excel — parse Excel price lists with AI column mapping
- POST /ai/extract-image — OCR image and extract product data
- POST /ai/extract-text — extract key info from freeform text (e.g. WhatsApp messages)

All extraction endpoints run delta detection against the catalog DB to flag
price changes vs new entries.
"""
import logging

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel

from ..dependencies import require_internal_secret
from ..llm.ollama_client import call_ollama_json
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


async def _extract_pdf_chunk_with_retry(
    markdown: str,
    *,
    document_type: str,
    page_range: str,
    default_currency: str = "CHF",
    max_attempts: int = 2,
) -> dict:
    deterministic_items = extract_catalog_from_markdown(markdown)
    stub = {
        "items": deterministic_items,
        "metadata": {
            "document_type": document_type,
            "page_range": page_range,
            "note": "Fallback extraction from markdown chunk",
        },
    }

    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            result = await call_ollama_json(
                system=f"""You are a document extraction AI for construction materials procurement.
You will receive markdown converted from PDF pages {page_range} of a {document_type}.
Extract only what is explicitly present in the chunk. Do not invent missing values.
If a line item begins on one page and ends on the next, use the overlapping context to merge it correctly.
Use null for missing numeric or date values instead of guessing.
Do not invent supplier names, SKUs, quantities, units, or prices that are not explicitly shown.

Return JSON: {{
  "items": [{{"name": "...", "sku": "...", "quantity": ..., "unit": "...", "unit_price": ..., "currency": "{default_currency}", "category": "..."}}],
  "metadata": {{"supplier_name": "...", "document_date": "...", "document_number": "...", "total_amount": ..., "currency": "{default_currency}", "page_range": "{page_range}"}}
}}""",
                messages=[{"role": "user", "content": f"Markdown chunk from pages {page_range}:\n\n{markdown}"}],
                max_tokens=2048,
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
  "items": [{{"name": "...", "sku": "...", "unit_price": ..., "currency": "{default_currency}", "unit": "...", "category": "...", "manufacturer": "..."}}],
  "metadata": {{"column_mapping": {{}}, "supplier_id": "{supplier_id}"}}
}}""",
        messages=[{"role": "user", "content": f"Excel data sample:\n{sample}"}],
        max_tokens=2048,
        temperature=0.0,
        stub={
            "items": _fallback_itemise_rows(sample, default_currency),
            "metadata": {"supplier_id": supplier_id, "note": "Fallback extraction from spreadsheet rows"},
        },
    )

    items = result.get("items", [])
    deltas, delta_summary = await _run_delta_detection(items, supplier_id=supplier_id or None)

    return ExtractionResult(
        status="ok",
        items=items,
        deltas=deltas,
        delta_summary=delta_summary,
        metadata=result.get("metadata", {}),
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
    if file.content_type and file.content_type not in ALLOWED_IMAGE_TYPES:
        from fastapi import HTTPException
        raise HTTPException(400, f"Unsupported image type: {file.content_type}. Allowed: {', '.join(ALLOWED_IMAGE_TYPES)}")

    content = await file.read()
    if len(content) > MAX_DOC_SIZE:
        from fastapi import HTTPException
        raise HTTPException(400, "File too large (max 50MB)")

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
  "items": [{{"name": "...", "sku": "...", "quantity": ..., "unit": "...", "unit_price": ..., "currency": "{default_currency}", "category": "..."}}],
  "metadata": {{"supplier_name": "...", "document_date": "...", "document_number": "...", "ocr_quality": "good|fair|poor"}}
}}""",
        messages=[{"role": "user", "content": f"OCR text lines:\n{sample}"}],
        max_tokens=2048,
        temperature=0.0,
        stub={
            "items": _fallback_itemise_rows(sample, default_currency),
            "metadata": {"document_type": document_type, "ocr": "processed", "note": "Fallback extraction from OCR rows"},
        },
    )

    items = result.get("items", [])
    deltas, delta_summary = await _run_delta_detection(items, supplier_id=supplier_id or None)

    return ExtractionResult(
        status="ok",
        items=items,
        deltas=deltas,
        delta_summary=delta_summary,
        metadata=result.get("metadata", {}),
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
Look for: material names, quantities, units, prices, dates, supplier names, addresses.

Return JSON: {{
  "items": [{{"name": "...", "quantity": ..., "unit": "...", "estimated_price": ..., "currency": "CHF"}}],
  "metadata": {{"sender": "...", "date": "...", "urgency": "low|medium|high", "project_reference": "..."}},
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
    return result
