from fastapi import Header, HTTPException, status

from .config import get_settings


def require_internal_secret(x_internal_secret: str | None = Header(default=None)) -> None:
    expected = get_settings().INTERNAL_SHARED_SECRET
    if not x_internal_secret or x_internal_secret != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Internal-Secret",
        )
