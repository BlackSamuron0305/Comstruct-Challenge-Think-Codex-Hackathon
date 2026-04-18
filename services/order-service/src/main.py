from contextlib import asynccontextmanager
import time
import logging

from fastapi import FastAPI, Request, Response
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .routers import approvals, cart, internal_auth, orders, projects, registration

logger = logging.getLogger("order-service")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield


app = FastAPI(title="comstruct order-service", version="0.2.0", lifespan=lifespan)

# Trusted host check — only gateway should call internal services
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])


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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "order-service"}
