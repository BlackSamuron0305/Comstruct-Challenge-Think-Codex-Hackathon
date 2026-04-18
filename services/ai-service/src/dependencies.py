from fastapi import Header, HTTPException, status

from .config import settings


async def require_internal_secret(x_internal_secret: str | None = Header(default=None)) -> None:
    if x_internal_secret != settings.INTERNAL_SHARED_SECRET:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid_internal_secret")
