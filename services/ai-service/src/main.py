import logging
import time

from fastapi import FastAPI, Request, Response
from fastapi.responses import HTMLResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import settings
from .llm.ollama_client import check_ollama_health
from .routers import ai, ingest, suppliers, chat, documents, workflows

logging.basicConfig(level=str(settings.LOG_LEVEL).upper())
logger = logging.getLogger("ai-service")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


app = FastAPI(title="comstruct ai-service", version="0.3.0")
app.add_middleware(SecurityHeadersMiddleware)


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
    ollama = await check_ollama_health() if settings.LLM_PROVIDER == "ollama" else {"status": "disabled"}
    return {
        "status": "ok",
        "service": "ai-service",
        "llm_backend": settings.LLM_PROVIDER,
        "openai_configured": bool(settings.OPENAI_API_KEY),
        "anthropic_configured": bool(settings.OPENAI_API_KEY),
        "ollama": ollama,
    }


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def dashboard():
    import json as _json
    h = await health()
    status_color = "#22c55e" if h["status"] == "ok" else "#ef4444"
    endpoints = [
        ("GET", "/health", "Health check", ""),
        ("POST", "/ai/map-columns", "Map CSV columns to schema", "internal"),
        ("POST", "/ai/classify", "Classify products", "internal"),
        ("POST", "/ai/recommend", "Supplier recommendations", "internal"),
        ("POST", "/ai/chat", "Single-turn AI chat", "internal"),
        ("POST", "/ai/chat/stream", "Streaming AI chat (SSE)", "internal"),
        ("POST", "/ai/analyze-photo", "Analyze construction photo", "internal"),
        ("POST", "/ai/upload-image", "Upload image for analysis", "internal"),
        ("POST", "/ai/transcribe-audio", "Transcribe audio", "internal"),
        ("POST", "/ai/extract-pdf", "Extract data from PDF (+ delta detection)", "internal"),
        ("POST", "/ai/extract-excel", "Extract data from Excel (+ delta detection)", "internal"),
        ("POST", "/ai/extract-image", "OCR image → extract data (+ delta detection)", "internal"),
        ("POST", "/ai/extract-text", "Extract data from text", "internal"),
        ("POST", "/ai/workflow/auto-approve", "Auto-approval workflow", "internal"),
        ("POST", "/ai/workflow/price-analysis", "Price analysis workflow", "internal"),
        ("POST", "/ai/workflow/reorder-check", "Reorder check workflow", "internal"),
        ("POST", "/ai/workflow/compliance-check", "Compliance check workflow", "internal"),
        ("POST", "/ingest/supplier-file", "Ingest supplier CSV/Excel", "internal"),
        ("POST", "/suppliers/{id}/compute-score", "Compute supplier score", "internal"),
        ("GET", "/suppliers/compare", "Compare suppliers", "internal"),
        ("GET", "/suppliers/{id}/approval-recommendation", "Get approval recommendation", "internal"),
        ("POST", "/suppliers/{id}/scrape", "Trigger supplier web scrape", "internal"),
        ("POST", "/suppliers/web-search", "Web search for suppliers", "internal"),
        ("POST", "/suppliers/proposals", "Create supplier proposal", "internal"),
        ("GET", "/suppliers/preferred/{company_id}", "Get preferred suppliers", "internal"),
    ]
    rows = ""
    for method, path, desc, badge in endpoints:
        badge_html = f'<span class="badge">{badge}</span>' if badge else ""
        rows += (
            f'<div class="endpoint">'
            f'<span class="method {method}">{method}</span>'
            f'<span class="path">{path}</span>'
            f'<span class="desc">{desc}{badge_html}</span></div>\n'
        )
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Service</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}body{{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:2rem}}
.container{{max-width:800px;margin:0 auto}}
.header{{display:flex;align-items:center;gap:1rem;margin-bottom:2rem}}
.status-dot{{width:12px;height:12px;border-radius:50%;background:{status_color};box-shadow:0 0 8px {status_color}}}
h1{{font-size:1.5rem;font-weight:600}}
.card{{background:#1e293b;border-radius:12px;padding:1.5rem;margin-bottom:1rem;border:1px solid #334155}}
.card h2{{font-size:1rem;color:#94a3b8;margin-bottom:1rem;text-transform:uppercase;letter-spacing:0.05em;font-weight:500}}
.health-json{{background:#0f172a;border-radius:8px;padding:1rem;font-family:monospace;font-size:0.875rem;color:#67e8f9;overflow-x:auto;white-space:pre}}
.endpoint{{display:flex;align-items:center;gap:0.75rem;padding:0.625rem 0;border-bottom:1px solid #334155}}
.endpoint:last-child{{border-bottom:none}}
.method{{font-size:0.75rem;font-weight:700;padding:0.25rem 0.5rem;border-radius:4px;font-family:monospace;min-width:3.5rem;text-align:center}}
.method.GET{{background:#22d3ee20;color:#22d3ee}}.method.POST{{background:#a78bfa20;color:#a78bfa}}.method.PUT{{background:#fbbf2420;color:#fbbf24}}.method.DELETE{{background:#f8717120;color:#f87171}}
.path{{font-family:monospace;font-size:0.875rem;color:#f8fafc}}
.desc{{font-size:0.75rem;color:#64748b;margin-left:auto}}
.badge{{display:inline-block;font-size:0.625rem;padding:0.125rem 0.375rem;border-radius:4px;background:#f59e0b20;color:#f59e0b;margin-left:0.5rem}}
.links{{display:flex;gap:1rem;margin-bottom:2rem}}
.links a{{color:#38bdf8;text-decoration:none;font-size:0.875rem;padding:0.5rem 1rem;border:1px solid #334155;border-radius:8px}}
.links a:hover{{background:#1e293b}}
</style></head><body><div class="container">
<div class="header"><div class="status-dot"></div><h1>\U0001F916 AI Service</h1><span style="color:#64748b;font-size:0.875rem">Port 8005</span></div>
<div class="links"><a href="/docs">\U0001F4D6 Swagger UI</a><a href="/redoc">\U0001F4D1 ReDoc</a></div>
<div class="card"><h2>Health</h2><div class="health-json">{_json.dumps(h, indent=2)}</div></div>
<div class="card"><h2>API Endpoints ({len(endpoints)})</h2>
{rows}</div></div></body></html>"""
