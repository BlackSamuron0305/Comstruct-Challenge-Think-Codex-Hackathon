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
from ..llm.anthropic_client import call_claude_json
from ..services.delta_detection import detect_deltas
from ..services.parsing import (
    extract_catalog_from_markdown,
    parse_image_to_table,
    parse_pdf_to_markdown,
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


@router.post("/extract-pdf", response_model=ExtractionResult, dependencies=[Depends(require_internal_secret)])
async def extract_pdf(
    file: UploadFile = File(...),
    document_type: str = Form("invoice"),
    supplier_id: str = Form(""),
):
    """Extract structured data from a PDF document using AI."""
    content = await file.read()
    markdown = parse_pdf_to_markdown(content)
    df = parse_pdf_to_table(content)

    if df.empty:
        return ExtractionResult(
            status="empty", items=[], deltas=[], delta_summary={}, metadata={"document_type": document_type}, raw_row_count=0,
        )

    sample = df.head(20).to_dict(orient="records")
    columns = list(df.columns)
    direct_items = extract_catalog_from_markdown(markdown)

    if direct_items:
        items = direct_items
        metadata = {
            "document_type": document_type,
            "strategy": "markdown_direct",
            "markdown_chars": len(markdown),
        }
    else:
        result = await call_claude_json(
            system=f"""You are a document extraction AI for construction materials procurement.
Extract structured data from this {document_type} PDF content converted to markdown.
Prefer deterministic extraction from markdown tables before inference.
The tabular parse columns are: {columns}

Return JSON: {{
  "items": [{{"name": "...", "sku": "...", "quantity": ..., "unit": "...", "unit_price": ..., "currency": "CHF", "category": "...", "confidence": 0.0-1.0}}],
  "metadata": {{"supplier_name": "...", "document_date": "...", "document_number": "...", "total_amount": ..., "currency": "CHF"}}
}}""",
            messages=[{"role": "user", "content": f"Markdown:\n{markdown[:12000]}\n\nTabular rows:\n{sample}"}],
            max_tokens=2048,
            temperature=0.0,
            stub={
                "items": [{"name": row.get(columns[0], ""), "raw": row, "confidence": 0.5} for row in sample[:5]] if sample else [],
                "metadata": {"document_type": document_type, "note": "LLM extraction fallback used"},
            },
        )
        items = result.get("items", [])
        metadata = result.get("metadata", {})
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

    result = await call_claude_json(
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
            "items": [{"name": str(row.get(columns[0], "")), "raw": row} for row in sample[:5]] if sample else [],
            "metadata": {"supplier_id": supplier_id},
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

    result = await call_claude_json(
        system=f"""You are a document extraction AI for construction materials procurement.
Extract structured product data from this OCR text captured from a {document_type} image.
The text may have OCR artifacts — be tolerant of typos and misaligned columns.

Return JSON: {{
  "items": [{{"name": "...", "sku": "...", "quantity": ..., "unit": "...", "unit_price": ..., "currency": "{default_currency}", "category": "..."}}],
  "metadata": {{"supplier_name": "...", "document_date": "...", "document_number": "...", "ocr_quality": "good|fair|poor"}}
}}""",
        messages=[{"role": "user", "content": f"OCR text lines:\n{sample}"}],
        max_tokens=2048,
        temperature=0.0,
        stub={
            "items": [],
            "metadata": {"document_type": document_type, "ocr": "processed", "note": "Ollama extraction pending"},
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
    result = await call_claude_json(
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
            "items": [],
            "metadata": {"extraction_type": body.extraction_type},
            "summary": "Text extraction requires Ollama model.",
        },
    )
    return result
