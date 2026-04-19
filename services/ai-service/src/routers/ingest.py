import json
import uuid

from fastapi import APIRouter, Depends, File, Form, UploadFile

from ..dependencies import require_internal_secret
from ..events import publish_ai_progress
from ..services.ingestion import ingest_supplier_file, preview_supplier_file
from ..services.upload_validation import (
    SUPPORTED_DOCUMENT_EXTENSIONS,
    SUPPORTED_DOCUMENT_TYPES,
    validate_uploaded_file,
)

router = APIRouter(prefix="/ingest", tags=["ingest"])


def _parse_mapping_overrides(raw: str | None) -> list[dict] | None:
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if isinstance(parsed, list):
        return [item for item in parsed if isinstance(item, dict)]
    return None


@router.post(
    "/preview",
    dependencies=[Depends(require_internal_secret)],
)
async def preview(
    file: UploadFile = File(...),
    mapping_overrides: str | None = Form(None),
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
    )

    await publish_ai_progress(job_id, status="completed", progress=1.0, detail="Ingestion complete")
    result["job_id"] = job_id
    return result
