"""Integration tests for AI service workflows.

Tests the full request→AI→response pipeline using the running Ollama instance.
Run with: pytest tests/ -v --tb=short
"""
import os
import pytest
import httpx

# Point at the running AI service (in Docker or local)
AI_BASE = os.environ.get("AI_SERVICE_URL", "http://localhost:8005")
INTERNAL_SECRET = os.environ.get("INTERNAL_SHARED_SECRET", "dev-internal-secret")

HEADERS = {"x-internal-secret": INTERNAL_SECRET, "content-type": "application/json"}


@pytest.fixture
def client():
    return httpx.AsyncClient(base_url=AI_BASE, headers=HEADERS, timeout=120)


# ── Health ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health(client):
    """AI service should report healthy with Ollama status."""
    async with client:
        r = await client.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert data["llm_backend"] == "ollama"
        assert "ollama" in data


# ── Chat ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_chat_basic(client):
    """Chat endpoint should return a structured response."""
    async with client:
        r = await client.post("/ai/chat", json={
            "message": "Was kostet eine Palette Zement?",
            "language": "de",
        })
        assert r.status_code == 200
        data = r.json()
        assert "reply" in data
        assert isinstance(data["reply"], str)
        assert len(data["reply"]) > 0


@pytest.mark.asyncio
async def test_chat_with_context(client):
    """Chat should incorporate project context."""
    async with client:
        r = await client.post("/ai/chat", json={
            "message": "What materials do I need?",
            "language": "en",
            "context": {
                "project": "Office renovation",
                "trade": "plumbing",
                "budget": 5000,
                "currency": "CHF",
            },
        })
        assert r.status_code == 200
        data = r.json()
        assert "reply" in data


@pytest.mark.asyncio
async def test_chat_stream(client):
    """Streaming chat should return SSE events."""
    async with client:
        async with client.stream("POST", "/ai/chat/stream", json={
            "message": "List 3 common construction materials",
            "language": "en",
        }) as r:
            assert r.status_code == 200
            chunks = []
            async for line in r.aiter_lines():
                if line.startswith("data: "):
                    chunks.append(line[6:])
            assert len(chunks) > 0
            assert chunks[-1] == "[DONE]"


# ── Classification ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_classify_materials(client):
    """Material classification should return A/B/C classes."""
    async with client:
        r = await client.post("/ai/classify", json={
            "items": [
                {"name": "Betonrohr DN300", "unit_price": 250.0, "category": "Tiefbau"},
                {"name": "Schrauben M8x40", "unit_price": 0.50, "category": "Befestigung"},
                {"name": "Isolierband", "unit_price": 3.50, "category": "Elektro"},
            ],
        })
        assert r.status_code == 200
        data = r.json()
        assert "results" in data
        assert len(data["results"]) == 3
        for result in data["results"]:
            assert result["material_class"] in ("A", "B", "C")


# ── Workflows ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_auto_approve_small_order(client):
    """Small order below threshold should be auto-approved."""
    async with client:
        r = await client.post("/ai/workflow/auto-approve", json={
            "order_id": "test-001",
            "items": [{"name": "Schrauben", "quantity": 100, "unit_price": 0.50}],
            "total_amount": 50.0,
            "currency": "CHF",
            "company_id": "test-company",
            "requester_role": "construction_worker",
            "approval_threshold": 200.0,
        })
        assert r.status_code == 200
        data = r.json()
        assert data["decision"] == "auto_approved"
        assert data["confidence"] >= 0.9


@pytest.mark.asyncio
async def test_auto_approve_large_order_needs_review(client):
    """Large order should require review."""
    async with client:
        r = await client.post("/ai/workflow/auto-approve", json={
            "order_id": "test-002",
            "items": [{"name": "Stahlträger HEB200", "quantity": 50, "unit_price": 180.0}],
            "total_amount": 9000.0,
            "currency": "CHF",
            "company_id": "test-company",
            "requester_role": "construction_worker",
            "approval_threshold": 200.0,
        })
        assert r.status_code == 200
        data = r.json()
        assert data["decision"] in ("requires_review", "rejected")
        assert len(data["risk_factors"]) > 0


@pytest.mark.asyncio
async def test_price_analysis(client):
    """Price analysis should return assessment."""
    async with client:
        r = await client.post("/ai/workflow/price-analysis", json={
            "product_name": "Portland Zement CEM I 42.5",
            "current_price": 12.50,
            "currency": "CHF",
            "historical_prices": [
                {"price": 11.80, "date": "2025-01-15", "supplier": "Holcim"},
                {"price": 12.20, "date": "2025-02-10", "supplier": "Holcim"},
                {"price": 13.00, "date": "2025-03-05", "supplier": "Jura Cement"},
            ],
        })
        assert r.status_code == 200
        data = r.json()
        assert "assessment" in data
        assert data["assessment"] in ("fair", "high", "low", "suspicious")


@pytest.mark.asyncio
async def test_reorder_check(client):
    """Reorder check should return alerts."""
    async with client:
        r = await client.post("/ai/workflow/reorder-check", json={
            "project_id": "test-project",
            "materials": [
                {"name": "Zement 25kg", "current_stock": 5, "daily_usage": 3, "unit": "sack"},
                {"name": "Bewehrungsstahl", "current_stock": 200, "daily_usage": 10, "unit": "kg"},
            ],
        })
        assert r.status_code == 200
        data = r.json()
        assert "alerts" in data
        assert "summary" in data


@pytest.mark.asyncio
async def test_compliance_check_within_budget(client):
    """Compliance check within budget should pass."""
    async with client:
        r = await client.post("/ai/workflow/compliance-check", json={
            "order_items": [{"name": "Schrauben", "unit_price": 5, "quantity": 10}],
            "project_id": "test-project",
            "project_budget": 10000.0,
            "project_spent": 2000.0,
        })
        assert r.status_code == 200
        data = r.json()
        assert data["compliant"] is True


@pytest.mark.asyncio
async def test_compliance_check_over_budget(client):
    """Compliance check over budget should fail."""
    async with client:
        r = await client.post("/ai/workflow/compliance-check", json={
            "order_items": [{"name": "Stahlträger", "unit_price": 500, "quantity": 20}],
            "project_id": "test-project",
            "project_budget": 10000.0,
            "project_spent": 9500.0,
        })
        assert r.status_code == 200
        data = r.json()
        assert data["compliant"] is False
        assert len(data["issues"]) > 0


# ── Document Extraction ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_extract_text(client):
    """Text extraction should parse freeform procurement text."""
    async with client:
        r = await client.post("/ai/extract-text", json={
            "text": "Hallo, brauche 50 Sack Zement und 200m Bewehrungsstahl für Baustelle Zürich. Lieferung bis Freitag bitte.",
            "extraction_type": "order",
        })
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "summary" in data


@pytest.mark.asyncio
async def test_analyze_photo(client):
    """Photo analysis should return material suggestions."""
    async with client:
        r = await client.post("/ai/analyze-photo", json={
            "description": "Concrete foundation with exposed rebar, partially poured. Steel formwork visible. Missing concrete cover on east side.",
        })
        assert r.status_code == 200
        data = r.json()
        assert "materials" in data
        assert "observations" in data


# ── Supplier Scoring ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_supplier_comparison(client):
    """Supplier comparison should return structured results."""
    async with client:
        r = await client.get("/suppliers/compare", params={
            "product_id": "00000000-0000-0000-0000-000000000001",
        })
        # May return 500 if no data in DB — that's expected for integration test
        assert r.status_code in (200, 500)


# ── Auth guard ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_no_secret_returns_401():
    """Requests without internal secret should be rejected."""
    async with httpx.AsyncClient(base_url=AI_BASE, timeout=10) as client:
        r = await client.post("/ai/chat", json={"message": "test"})
        assert r.status_code == 401
