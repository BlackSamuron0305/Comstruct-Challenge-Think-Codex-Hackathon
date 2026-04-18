"""Security tests for catalog-service."""
from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app, raise_server_exceptions=False)


class TestSecurityHeaders:
    def test_health_has_security_headers(self):
        r = client.get("/health")
        assert r.headers["X-Content-Type-Options"] == "nosniff"
        assert r.headers["X-Frame-Options"] == "DENY"
        assert r.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
