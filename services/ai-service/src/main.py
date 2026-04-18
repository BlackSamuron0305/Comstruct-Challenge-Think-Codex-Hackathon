import logging
import time

from fastapi import FastAPI, Request, Response

from .config import settings
from .llm.ollama_client import check_ollama_health
from .routers import ai, ingest, suppliers, chat, documents, workflows

logging.basicConfig(level=str(settings.LOG_LEVEL).upper())
logger = logging.getLogger("ai-service")

app = FastAPI(title="comstruct ai-service", version="0.3.0")


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
app.include_router(chat.router)
app.include_router(documents.router)
app.include_router(workflows.router)


@app.get("/health")
async def health():
    ollama = await check_ollama_health()
    return {
        "status": "ok",
        "service": "ai-service",
        "llm_backend": "ollama",
        "ollama": ollama,
    }
