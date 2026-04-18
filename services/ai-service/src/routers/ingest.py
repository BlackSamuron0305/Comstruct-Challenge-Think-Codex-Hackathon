import uuid

from fastapi import APIRouter, Depends, File, Form, UploadFile

from ..dependencies import require_internal_secret
from ..events import publish_ai_progress
from ..services.ingestion import ingest_supplier_file

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post(
    "/supplier-file",
    dependencies=[Depends(require_internal_secret)],
)
async def supplier_file(
    supplier_id: str = Form(...),
    default_currency: str = Form("CHF"),
    file: UploadFile = File(...),
):
    job_id = str(uuid.uuid4())
    await publish_ai_progress(job_id, status="started", progress=0.0, detail="Reading file...")

    content = await file.read()
    await publish_ai_progress(job_id, status="processing", progress=0.2, detail="Parsing document...")

    result = await ingest_supplier_file(
        supplier_id=supplier_id,
        filename=file.filename or "upload.csv",
        content=content,
        default_currency=default_currency,
    )

    await publish_ai_progress(job_id, status="completed", progress=1.0, detail="Ingestion complete")
    result["job_id"] = job_id
    return result
