import logging
import time

from fastapi import FastAPI, Request, Response

from .config import settings
from .routers import ai, ingest, suppliers

logging.basicConfig(level=str(settings.LOG_LEVEL).upper())
logger = logging.getLogger("ai-service")

app = FastAPI(title="comstruct ai-service", version="0.2.0")


@app.middleware("http")
async def audit_log_middleware(request: Request, call_next):
    start = time.monotonic()
    response: Response = await call_next(request)
    elapsed = time.monotonic() - start

    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        user_id = request.headers.get("x-user-id", "anonymous")
        logger.info(
            "AUDIT action=%s path=%s user=%s status=%d duration_ms=%.1f",
            request.method,
            request.url.path,
            user_id,
            response.status_code,
            elapsed * 1000,
        )
    return response


app.include_router(ai.router)
app.include_router(ingest.router)
app.include_router(suppliers.router)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "ai-service",
        "anthropic_configured": bool(settings.ANTHROPIC_API_KEY),
        "openai_configured": bool(settings.OPENAI_API_KEY),
    }
