from contextlib import asynccontextmanager
import time
import logging

from fastapi import FastAPI, Request, Response
from fastapi.responses import HTMLResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .routers import approvals, cart, gdpr, internal_auth, orders, projects, registration

logger = logging.getLogger("order-service")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
        # HSTS: browsers remember to use HTTPS for 1 year (only meaningful behind TLS termination).
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield


app = FastAPI(title="comstruct order-service", version="0.2.0", lifespan=lifespan)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["order-service", "localhost", "api-gateway", "127.0.0.1", "testserver"],
)


@app.middleware("http")
async def audit_log_middleware(request: Request, call_next):
    """Log all mutating requests for compliance audit trail."""
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


app.include_router(cart.router)
app.include_router(orders.router)
app.include_router(approvals.router)
app.include_router(projects.router)
app.include_router(internal_auth.router)
app.include_router(registration.router)
app.include_router(gdpr.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "order-service"}


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def dashboard():
    import json as _json
    h = await health()
    status_color = "#22c55e" if h["status"] == "ok" else "#ef4444"
    endpoints = [
        ("GET", "/health", "Health check", ""),
        ("GET", "/cart", "Get shopping cart", "auth"),
        ("POST", "/cart/add", "Add item to cart", "auth"),
        ("DELETE", "/cart/{product_id}", "Remove item from cart", "auth"),
        ("DELETE", "/cart", "Clear entire cart", "auth"),
        ("POST", "/orders/checkout", "Checkout cart as order", "auth"),
        ("GET", "/orders", "List orders", "auth"),
        ("GET", "/orders/{id}", "Get order details", "auth"),
        ("POST", "/orders/{id}/approve", "Approve an order", "auth"),
        ("POST", "/orders/{id}/reject", "Reject an order", "auth"),
        ("POST", "/orders/{id}/mark-in-transit", "Mark order in transit", "auth"),
        ("POST", "/orders/{id}/mark-delivered", "Mark order delivered", "auth"),
        ("DELETE", "/orders/{id}", "Delete draft order", "auth"),
        ("GET", "/approvals/rule", "Get approval rules", "auth"),
        ("PUT", "/approvals/rule", "Update approval rules", "auth"),
        ("GET", "/projects", "List projects", "auth"),
        ("GET", "/projects/{id}", "Get project details", "auth"),
        ("POST", "/internal/auth/verify-credentials", "Verify user credentials", "internal"),
        ("GET", "/internal/auth/users/{id}", "Get user by ID", "internal"),
        ("POST", "/internal/auth/register", "Register new user", "internal"),
        ("PUT", "/internal/auth/profile", "Update user profile", "internal"),
    ]
    rows = ""
    for method, path, desc, badge in endpoints:
        badge_html = f'<span class="badge {badge}">{badge}</span>' if badge else ""
        rows += (
            f'<div class="endpoint">'
            f'<span class="method {method}">{method}</span>'
            f'<span class="path">{path}</span>'
            f'<span class="desc">{desc}{badge_html}</span></div>\n'
        )
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Order Service</title>
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
.badge{{display:inline-block;font-size:0.625rem;padding:0.125rem 0.375rem;border-radius:4px;margin-left:0.5rem}}
.badge.auth{{background:#3b82f620;color:#3b82f6}}.badge.internal{{background:#f59e0b20;color:#f59e0b}}
.links{{display:flex;gap:1rem;margin-bottom:2rem}}
.links a{{color:#38bdf8;text-decoration:none;font-size:0.875rem;padding:0.5rem 1rem;border:1px solid #334155;border-radius:8px}}
.links a:hover{{background:#1e293b}}
</style></head><body><div class="container">
<div class="header"><div class="status-dot"></div><h1>\U0001F4E6 Order Service</h1><span style="color:#64748b;font-size:0.875rem">Port 8002</span></div>
<div class="links"><a href="/docs">\U0001F4D6 Swagger UI</a><a href="/redoc">\U0001F4D1 ReDoc</a></div>
<div class="card"><h2>Health</h2><div class="health-json">{_json.dumps(h, indent=2)}</div></div>
<div class="card"><h2>API Endpoints ({len(endpoints)})</h2>
{rows}</div></div></body></html>"""
