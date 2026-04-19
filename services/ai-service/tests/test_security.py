"""Security tests for ai-service."""
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app

client = TestClient(app, raise_server_exceptions=False)
INTERNAL_HEADERS = {"X-Internal-Secret": settings.INTERNAL_SHARED_SECRET}


class TestSecurityHeaders:
    def test_health_has_security_headers(self):
        r = client.get("/health")
        assert r.headers["X-Content-Type-Options"] == "nosniff"
        assert r.headers["X-Frame-Options"] == "DENY"
        assert r.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"


class TestUploadValidation:
    def test_ingest_preview_rejects_unsupported_file_type(self):
        r = client.post(
            "/ingest/preview",
            headers=INTERNAL_HEADERS,
            files={"file": ("payload.exe", b"MZ", "application/octet-stream")},
        )
        assert r.status_code == 415
        assert r.json()["detail"] == "unsupported_file_type"

    def test_extract_image_rejects_oversized_file(self, monkeypatch):
        payload = b"x" * 8
        monkeypatch.setattr("src.routers.documents.MAX_DOC_SIZE", 4)
        r = client.post(
            "/ai/extract-image",
            headers=INTERNAL_HEADERS,
            data={"document_type": "site-photo"},
            files={"file": ("photo.png", payload, "image/png")},
        )
        assert r.status_code == 413
        assert r.json()["detail"] == "file_too_large"
