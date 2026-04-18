from fastapi.testclient import TestClient

from src.main import app


def test_health():
    r = TestClient(app).get("/health")
    assert r.status_code == 200
    j = r.json()
    assert j["service"] == "ai-service"
    assert "anthropic_configured" in j
