from fastapi import APIRouter, Depends, File, Form, UploadFile

from ..dependencies import require_internal_secret
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
    content = await file.read()
    result = await ingest_supplier_file(
        supplier_id=supplier_id,
        filename=file.filename or "upload.csv",
        content=content,
        default_currency=default_currency,
    )
    return result
