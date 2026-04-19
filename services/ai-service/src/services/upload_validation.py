from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException, UploadFile, status


SUPPORTED_DOCUMENT_TYPES = {
    "text/csv",
    "application/csv",
    "application/pdf",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.oasis.opendocument.spreadsheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/tab-separated-values",
    "application/octet-stream",
}

SUPPORTED_DOCUMENT_EXTENSIONS = {".csv", ".tsv", ".xls", ".xlsx", ".ods", ".pdf", ".docx", ".doc"}
SUPPORTED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp"}
SUPPORTED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".webm", ".mp4", ".m4a", ".aac"}


def validate_uploaded_file(
    file: UploadFile,
    content: bytes,
    *,
    allowed_content_types: set[str] | None = None,
    allowed_extensions: set[str] | None = None,
    max_size: int,
) -> None:
    filename = (file.filename or "upload").strip()
    suffix = Path(filename).suffix.lower()
    content_type = (file.content_type or "").lower().strip()

    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="empty_file")

    if len(content) > max_size:
        raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="file_too_large")

    type_ok = not allowed_content_types or content_type in allowed_content_types
    extension_ok = not allowed_extensions or suffix in allowed_extensions
    if content_type == "application/octet-stream":
        type_ok = False

    if not type_ok and not extension_ok:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="unsupported_file_type")
