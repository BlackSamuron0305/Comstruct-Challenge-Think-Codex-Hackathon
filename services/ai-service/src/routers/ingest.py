import json
import uuid

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel, Field

from ..dependencies import require_internal_secret
from ..events import publish_ai_progress
from ..services.delta_detection import detect_deltas
from ..services.ingestion import ingest_supplier_file, ingest_rows_direct, preview_supplier_file
from ..services.upload_validation import (
    SUPPORTED_DOCUMENT_EXTENSIONS,
    SUPPORTED_DOCUMENT_TYPES,
    validate_uploaded_file,
)
from ..services.url_fetcher import fetch_url

router = APIRouter(prefix="/ingest", tags=["ingest"])


class IngestRowsRequest(BaseModel):
    supplier_id: str
    rows: list[dict] = Field(..., min_length=1)
    default_currency: str = "CHF"


def _parse_json_list(raw: str | None) -> list[dict] | None:
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if isinstance(parsed, list):
        return [item for item in parsed if isinstance(item, dict)]
    return None


def _parse_mapping_overrides(raw: str | None) -> list[dict] | None:
    return _parse_json_list(raw)


def _parse_prepared_rows(raw: str | None) -> list[dict] | None:
    return _parse_json_list(raw)


@router.post(
    "/preview",
    dependencies=[Depends(require_internal_secret)],
)
async def preview(
    file: UploadFile = File(...),
    mapping_overrides: str | None = Form(None),
    supplier_id: str | None = Form(None),
):
    content = await file.read()
    validate_uploaded_file(
        file,
        content,
        allowed_content_types=SUPPORTED_DOCUMENT_TYPES,
        allowed_extensions=SUPPORTED_DOCUMENT_EXTENSIONS,
        max_size=50 * 1024 * 1024,
    )
    return await preview_supplier_file(
        filename=file.filename or "upload.csv",
        content=content,
        mapping_overrides=_parse_mapping_overrides(mapping_overrides),
        supplier_id=supplier_id,
    )


@router.post(
    "/supplier-file",
    dependencies=[Depends(require_internal_secret)],
)
async def supplier_file(
    supplier_id: str = Form(...),
    default_currency: str = Form("CHF"),
    file: UploadFile = File(...),
    mapping_overrides: str | None = Form(None),
    prepared_rows: str | None = Form(None),
):
    job_id = str(uuid.uuid4())
    await publish_ai_progress(job_id, status="started", progress=0.0, detail="Reading file...")

    content = await file.read()
    validate_uploaded_file(
        file,
        content,
        allowed_content_types=SUPPORTED_DOCUMENT_TYPES,
        allowed_extensions=SUPPORTED_DOCUMENT_EXTENSIONS,
        max_size=50 * 1024 * 1024,
    )
    await publish_ai_progress(job_id, status="processing", progress=0.2, detail="Parsing document...")

    result = await ingest_supplier_file(
        supplier_id=supplier_id,
        filename=file.filename or "upload.csv",
        content=content,
        default_currency=default_currency,
        mapping_overrides=_parse_mapping_overrides(mapping_overrides),
        prepared_rows=_parse_prepared_rows(prepared_rows),
    )

    await publish_ai_progress(job_id, status="completed", progress=1.0, detail="Ingestion complete")
    result["job_id"] = job_id
    return result


@router.post(
    "/rows",
    dependencies=[Depends(require_internal_secret)],
    summary="Ingest catalog rows from JSON (API-to-API, no file upload required)",
)
async def ingest_rows(body: IngestRowsRequest):
    """Accept pre-parsed rows as JSON — for supplier API integrations, CI pipelines,
    and the mobile offline queue. Rows must already use canonical field names
    (name, sku, unit_price, unit, currency, category, …). Column mapping is skipped."""
    job_id = str(uuid.uuid4())
    await publish_ai_progress(job_id, status="started", progress=0.0, detail="Ingesting rows from API...")

    result = await ingest_rows_direct(
        supplier_id=body.supplier_id,
        rows=body.rows,
        default_currency=body.default_currency,
    )

    await publish_ai_progress(job_id, status="completed", progress=1.0, detail="Ingestion complete")
    result["job_id"] = job_id
    return result


class IngestPreviewUrlRequest(BaseModel):
    url: str
    supplier_id: str | None = None
    api_key: str | None = None
    api_key_header: str = "Authorization"


@router.post(
    "/preview-url",
    dependencies=[Depends(require_internal_secret)],
    summary="Preview catalog data fetched from an external API or download URL",
)
async def preview_url(body: IngestPreviewUrlRequest):
    """Fetch a supplier's catalog from a remote URL and run the same AI preview
    pipeline as a file upload. Supports JSON arrays, CSV, TSV, Excel, ODS, DOCX,
    and PDF responses. The *api_key* is sent as ``Authorization: Bearer <key>``
    by default, or as a custom header via *api_key_header*.
    """
    content, filename = await fetch_url(
        body.url,
        api_key=body.api_key,
        api_key_header=body.api_key_header,
    )

    # JSON array path — skip column mapping, pass rows directly as prepared_rows
    if filename.endswith(".json"):
        try:
            data = json.loads(content)
            # Support common API wrapper shapes
            for key in ("items", "products", "data", "results", "rows"):
                if isinstance(data, dict) and key in data:
                    data = data[key]
                    break
            if isinstance(data, list) and data:
                from ..prompts.column_mapper import CANONICAL_FIELDS as _CF
                annotated_rows = data
                if body.supplier_id:
                    try:
                        annotated_rows = await detect_deltas([dict(item) for item in data if isinstance(item, dict)], supplier_id=body.supplier_id)
                        for row in annotated_rows:
                            delta_type = row.get("delta_type")
                            if delta_type == "new_entry":
                                row["import_status"] = "new"
                            elif delta_type == "price_change":
                                row["import_status"] = "changed"
                            elif delta_type == "unchanged":
                                row["import_status"] = "existing"
                    except Exception:
                        annotated_rows = data
                delta_summary = {
                    "new_entries": sum(1 for row in annotated_rows if row.get("delta_type") == "new_entry"),
                    "price_changes": sum(1 for row in annotated_rows if row.get("delta_type") == "price_change"),
                    "unchanged": sum(1 for row in annotated_rows if row.get("delta_type") == "unchanged"),
                }
                return {
                    "status": "ok",
                    "rows_in": len(data),
                    "preview_rows": annotated_rows[:10],
                    "prepared_rows": annotated_rows,
                    "source_columns": [],
                    "canonical_fields": _CF,
                    "mapping": {
                        "mappings": [],
                        "warnings": ["Fetched from API as JSON. Column mapping skipped."],
                    },
                    "pdf_metadata": None,
                    "delta_summary": delta_summary,
                    "source_url": body.url,
                }
        except (json.JSONDecodeError, TypeError):
            filename = "api-data.csv"  # re-try as plain text / CSV

    return await preview_supplier_file(filename=filename, content=content, supplier_id=body.supplier_id)
