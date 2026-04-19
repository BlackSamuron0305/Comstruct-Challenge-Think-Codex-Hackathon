"""Full-stack integration tests.

Tests the complete request flow: frontend → api-gateway → services.
Requires all Docker services to be running.

Run with: pytest tests/ -v --tb=short
"""
import os
import json
import pytest
import pytest_asyncio
import httpx

GATEWAY_URL = os.environ.get("API_GATEWAY_URL", "http://localhost:8001")
AI_SERVICE_URL = os.environ.get("AI_SERVICE_URL", "http://localhost:8005")
ORDER_SERVICE_URL = os.environ.get("ORDER_SERVICE_URL", "http://localhost:8002")

# Demo credentials
TEST_EMAIL = "foreman@brueckesg.ch"
TEST_PASSWORD = "comstruct-demo"


@pytest_asyncio.fixture
async def auth_token():
    """Get a valid JWT token via login."""
    async with httpx.AsyncClient(base_url=GATEWAY_URL, timeout=30) as client:
        r = await client.post("/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
        })
        assert r.status_code == 200, f"Login failed: {r.text}"
        return r.json()["access_token"]


@pytest.fixture
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


# ── Authentication Flow ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_returns_jwt():
    """Login should return access_token, refresh_token, and user info."""
    async with httpx.AsyncClient(base_url=GATEWAY_URL, timeout=30) as client:
        r = await client.post("/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
        })
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["email"] == TEST_EMAIL
        assert data["user"]["role"] == "foreman"


@pytest.mark.asyncio
async def test_login_invalid_credentials():
    """Invalid credentials should return 401."""
    async with httpx.AsyncClient(base_url=GATEWAY_URL, timeout=10) as client:
        r = await client.post("/auth/login", json={
            "email": TEST_EMAIL,
            "password": "wrong-password",
        })
        assert r.status_code == 401


@pytest.mark.asyncio
async def test_login_invalid_payload_returns_400():
    """Malformed login input should return a validation error, not a 500."""
    async with httpx.AsyncClient(base_url=GATEWAY_URL, timeout=10) as client:
        r = await client.post("/auth/login", json={
            "email": "sss@j",
            "password": "1234",
        })
        assert r.status_code == 400
        data = r.json()
        assert "message" in data


@pytest.mark.asyncio
async def test_refresh_token(auth_token):
    """Refresh token should return new access_token."""
    # First login to get refresh token
    async with httpx.AsyncClient(base_url=GATEWAY_URL, timeout=30) as client:
        r = await client.post("/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
        })
        refresh = r.json()["refresh_token"]

        # Use refresh token
        r2 = await client.post("/auth/refresh", json={"refresh_token": refresh})
        assert r2.status_code == 200
        assert "access_token" in r2.json()


@pytest.mark.asyncio
async def test_auth_me(auth_token):
    """GET /auth/me should return user info."""
    async with httpx.AsyncClient(base_url=GATEWAY_URL, timeout=10) as client:
        r = await client.get("/auth/me", headers={"Authorization": f"Bearer {auth_token}"})
        assert r.status_code == 200


# ── API Gateway Proxy ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_unauthenticated_api_returns_401():
    """API calls without token should return 401."""
    async with httpx.AsyncClient(base_url=GATEWAY_URL, timeout=10) as client:
        r = await client.get("/api/orders")
        assert r.status_code == 401


@pytest.mark.asyncio
async def test_gateway_health():
    """Gateway health check should work."""
    async with httpx.AsyncClient(base_url=GATEWAY_URL, timeout=10) as client:
        r = await client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


# ── AI Service via Gateway ────────────────────────────────────────

@pytest.mark.asyncio
async def test_ai_chat_via_gateway(auth_token):
    """AI chat should work through the gateway proxy."""
    async with httpx.AsyncClient(base_url=GATEWAY_URL, timeout=120) as client:
        r = await client.post(
            "/api/ai/chat",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"message": "What is Portland cement?", "language": "en"},
        )
        assert r.status_code == 200
        data = r.json()
        assert "reply" in data


@pytest.mark.asyncio
async def test_ai_classification_via_gateway(auth_token):
    """Material classification should work through the gateway."""
    async with httpx.AsyncClient(base_url=GATEWAY_URL, timeout=120) as client:
        r = await client.post(
            "/api/ai/classify",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "items": [
                    {"name": "Schrauben M8", "unit_price": 0.50},
                    {"name": "Betonrohr DN400", "unit_price": 300},
                ],
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert "results" in data


@pytest.mark.asyncio
async def test_ai_workflow_auto_approve_via_gateway(auth_token):
    """Auto-approval workflow should work through the gateway."""
    async with httpx.AsyncClient(base_url=GATEWAY_URL, timeout=120) as client:
        r = await client.post(
            "/api/ai/workflow/auto-approve",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "order_id": "integration-test-001",
                "items": [{"name": "Nails", "quantity": 500, "unit_price": 0.05}],
                "total_amount": 25.0,
                "currency": "CHF",
                "company_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "requester_role": "foreman",
                "approval_threshold": 200.0,
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["decision"] == "auto_approved"


@pytest.mark.asyncio
async def test_ingest_preview_via_gateway(auth_token):
    """Supplier file preview should extract rows and mapping via the gateway."""
    files = {
        "file": ("supplier.csv", b"sku,name,price\nA1,Concrete Screws,9.50\n", "text/csv"),
    }
    async with httpx.AsyncClient(base_url=GATEWAY_URL, timeout=120) as client:
        r = await client.post(
            "/api/ingest/preview",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "ok"
        assert data["rows_in"] >= 1
        assert len(data.get("preview_rows", [])) >= 1
        assert any(m.get("target_field") == "name" for m in data.get("mapping", {}).get("mappings", []))


@pytest.mark.asyncio
async def test_text_extraction_via_gateway(auth_token):
    """Freeform procurement text should be extracted into structured items."""
    async with httpx.AsyncClient(base_url=GATEWAY_URL, timeout=120) as client:
        r = await client.post(
            "/api/ai/extract-text",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "text": "Need 12 boxes of concrete screws for facade mounting tomorrow morning.",
                "extraction_type": "order",
            },
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data
        assert isinstance(data["items"], list)
        assert len(data["items"]) >= 1
        assert "summary" in data


@pytest.mark.asyncio
async def test_contract_text_extraction_detects_mandatory_supplier(auth_token):
    """Framework contract text should lock sourcing to the named supplier."""
    async with httpx.AsyncClient(base_url=GATEWAY_URL, timeout=120) as client:
        r = await client.post(
            "/api/ai/extract-text",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "text": "Framework contract for Project Alpenblick: fire-rated foam and backer rod must be purchased exclusively from Swiss Fix AG.",
                "extraction_type": "contract",
            },
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["metadata"]["source_locked"] is True
        assert data["metadata"]["contract_binding"] == "mandatory_supplier"
        assert data["metadata"]["mandatory_supplier_name"] == "Swiss Fix AG"
        assert len(data["items"]) >= 1
        assert all(item.get("required_supplier_name") == "Swiss Fix AG" for item in data["items"])


# ── Service Health Checks ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_all_services_healthy():
    """All services should report healthy."""
    services = {
        "api-gateway": GATEWAY_URL,
        "ai-service": AI_SERVICE_URL,
        "order-service": ORDER_SERVICE_URL,
    }
    for name, url in services.items():
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{url}/health")
            assert r.status_code == 200, f"{name} health check failed"
            assert r.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_ai_service_has_active_llm_provider():
    """AI service should expose an active and healthy LLM provider."""
    async with httpx.AsyncClient(base_url=AI_SERVICE_URL, timeout=10) as client:
        r = await client.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert data["llm_backend"] in {"openai", "ollama"}
        if data["llm_backend"] == "openai":
            assert data["openai_configured"] is True
        else:
            assert data["ollama"]["status"] == "ok"
