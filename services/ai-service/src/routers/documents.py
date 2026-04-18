"""Document extraction router — PDF/Excel AI processing.

Provides:
- POST /ai/extract-pdf — extract structured data from PDF invoices/quotes
- POST /ai/extract-excel — parse Excel price lists with AI column mapping
- POST /ai/extract-text — extract key info from freeform text (e.g. WhatsApp messages)
"""
import logging

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel

from ..dependencies import require_internal_secret
from ..llm.ollama_client import call_ollama_json
from ..services.parsing import parse_pdf_to_table, parse_tabular

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["documents"])


class ExtractionResult(BaseModel):
    status: str
    items: list[dict]
    metadata: dict
    raw_row_count: int


@router.post("/extract-pdf", response_model=ExtractionResult, dependencies=[Depends(require_internal_secret)])
async def extract_pdf(
    file: UploadFile = File(...),
    document_type: str = Form("invoice"),  # invoice, quote, delivery_note, price_list
):
    """Extract structured data from a PDF document using AI."""
    content = await file.read()
    df = parse_pdf_to_table(content)

    if df.empty:
        return ExtractionResult(status="empty", items=[], metadata={"document_type": document_type}, raw_row_count=0)

    # Send first rows to Ollama for intelligent extraction
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
            "items": [{"name": row.get(columns[0], ""), "raw": row} for row in sample[:5]] if sample else [],
            "metadata": {"document_type": document_type, "note": "Ollama extraction pending"},
        },
    )

    return ExtractionResult(
        status="ok",
        items=result.get("items", []),
        metadata=result.get("metadata", {}),
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
        return ExtractionResult(status="empty", items=[], metadata={}, raw_row_count=0)

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
            "items": [{"name": str(row.get(columns[0], "")), "raw": row} for row in sample[:5]] if sample else [],
            "metadata": {"supplier_id": supplier_id},
        },
    )

    return ExtractionResult(
        status="ok",
        items=result.get("items", []),
        metadata=result.get("metadata", {}),
        raw_row_count=len(df),
    )


class TextExtractionRequest(BaseModel):
    text: str
    extraction_type: str = "order"  # order, quote_request, material_list


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
            "items": [],
            "metadata": {"extraction_type": body.extraction_type},
            "summary": "Text extraction requires Ollama model.",
        },
    )
    return result
