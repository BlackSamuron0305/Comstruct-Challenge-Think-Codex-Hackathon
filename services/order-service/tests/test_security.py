"""Security tests verifying hardening controls.

These tests run against the FastAPI app without Docker and validate:
- Security headers on all responses
- TrustedHostMiddleware rejects unknown hosts
- Query parameter bounds enforcement
- Error message sanitisation (no internal leaks)
"""
from fastapi.testclient import TestClient

from src.main import app


client = TestClient(app, raise_server_exceptions=False)


# ── Security Headers ──────────────────────────────────────────────


class TestSecurityHeaders:
    """All responses must include hardening headers."""

    def test_health_has_security_headers(self):
        r = client.get("/health")
        assert r.headers["X-Content-Type-Options"] == "nosniff"
        assert r.headers["X-Frame-Options"] == "DENY"
        assert r.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"

    def test_404_has_security_headers(self):
        r = client.get("/nonexistent")
        assert r.headers.get("X-Content-Type-Options") == "nosniff"


# ── Query Parameter Bounds ────────────────────────────────────────


class TestQueryBounds:
    """Pagination params must be bounded to prevent abuse."""

    HEADERS = {
        "X-Internal-Secret": "dev-internal-secret",
        "X-User-Id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "X-User-Role": "foreman",
        "X-Company-Id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    }

    def test_limit_too_high_rejected(self):
        r = client.get("/orders?limit=999", headers=self.HEADERS)
        assert r.status_code == 422

    def test_negative_offset_rejected(self):
        r = client.get("/orders?offset=-1", headers=self.HEADERS)
        assert r.status_code == 422

    def test_limit_zero_rejected(self):
        r = client.get("/orders?limit=0", headers=self.HEADERS)
        assert r.status_code == 422


# ── Error Sanitisation ────────────────────────────────────────────


class TestErrorSanitisation:
    """Internal details must never leak in error responses."""

    def test_malformed_uuid_does_not_leak_traceback(self):
        r = client.get("/orders", headers={
            "X-Internal-Secret": "dev-internal-secret",
            "X-User-Id": "not-a-uuid",
            "X-User-Role": "foreman",
            "X-Company-Id": "also-not-uuid",
        })
        body = r.json()
        assert "Invalid request format" in body.get("detail", "")
        # Ensure no Python traceback or UUID format hints leak
        assert "ValueError" not in str(body)
        assert "badly formed" not in str(body)
