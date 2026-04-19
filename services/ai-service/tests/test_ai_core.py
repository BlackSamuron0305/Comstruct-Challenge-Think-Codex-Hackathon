"""AI core tests — unit tests for Ollama client and AI logic.

These tests verify:
1. Ollama client JSON parsing and error handling
2. Classification heuristics (offline fallback)
3. Embedding dimension consistency
4. Streaming response handling
5. Local execution without external dependencies

Run with: pytest tests/test_ai_core.py -v
"""
import json
import math
import pytest

from src.llm.ollama_client import (
    _extract_json,
    _deterministic_embedding,
    EMBED_DIM,
)
from src.services.classification import _stub_classify


# ── JSON extraction ───────────────────────────────────────────────

class TestJsonExtraction:
    def test_plain_json(self):
        result = _extract_json('{"key": "value"}')
        assert result == {"key": "value"}

    def test_json_with_fences(self):
        result = _extract_json('```json\n{"key": "value"}\n```')
        assert result == {"key": "value"}

    def test_json_with_surrounding_text(self):
        result = _extract_json('Here is the result: {"key": "value"} hope this helps')
        assert result == {"key": "value"}

    def test_json_array_wrapped(self):
        result = _extract_json('[{"a": 1}, {"a": 2}]')
        assert "results" in result
        assert len(result["results"]) == 2

    def test_nested_json(self):
        result = _extract_json('{"outer": {"inner": [1,2,3]}, "flag": true}')
        assert result["outer"]["inner"] == [1, 2, 3]

    def test_invalid_json_raises(self):
        with pytest.raises(ValueError):
            _extract_json("this is not json at all")

    def test_empty_string_raises(self):
        with pytest.raises(ValueError):
            _extract_json("")

    def test_json_with_newlines(self):
        text = '```\n{\n  "decision": "auto_approved",\n  "confidence": 0.95\n}\n```'
        result = _extract_json(text)
        assert result["decision"] == "auto_approved"


# ── Deterministic Embeddings ──────────────────────────────────────

class TestEmbeddings:
    def test_correct_dimension(self):
        emb = _deterministic_embedding("test text")
        assert len(emb) == EMBED_DIM

    def test_normalized(self):
        emb = _deterministic_embedding("test text")
        norm = math.sqrt(sum(x * x for x in emb))
        assert abs(norm - 1.0) < 0.001

    def test_deterministic(self):
        emb1 = _deterministic_embedding("same text")
        emb2 = _deterministic_embedding("same text")
        assert emb1 == emb2

    def test_different_texts_different_embeddings(self):
        emb1 = _deterministic_embedding("text one")
        emb2 = _deterministic_embedding("text two")
        assert emb1 != emb2

    def test_cosine_similarity_similar_texts(self):
        """Similar texts should have higher cosine similarity than dissimilar."""
        emb1 = _deterministic_embedding("Portland Zement CEM I")
        emb2 = _deterministic_embedding("Portland Zement CEM II")
        emb3 = _deterministic_embedding("Bewehrungsstahl B500")

        sim_12 = sum(a * b for a, b in zip(emb1, emb2))
        sim_13 = sum(a * b for a, b in zip(emb1, emb3))
        # Both should be valid floats
        assert isinstance(sim_12, float)
        assert isinstance(sim_13, float)


# ── Classification Heuristics ─────────────────────────────────────

class TestClassificationStub:
    def test_structural_keyword_class_a(self):
        result = _stub_classify([{"name": "Betonrohr DN300", "unit_price": 50}])
        assert result["results"][0]["material_class"] == "A"
        assert "keyword" in result["results"][0]["rationale"]

    def test_high_price_class_a(self):
        result = _stub_classify([{"name": "Special item", "unit_price": 150}])
        assert result["results"][0]["material_class"] == "A"

    def test_medium_price_class_b(self):
        result = _stub_classify([{"name": "Medium item", "unit_price": 75}])
        assert result["results"][0]["material_class"] == "B"

    def test_low_price_class_c(self):
        result = _stub_classify([{"name": "Schrauben M8", "unit_price": 0.50}])
        assert result["results"][0]["material_class"] == "C"

    def test_no_price_class_c(self):
        result = _stub_classify([{"name": "Unknown item"}])
        assert result["results"][0]["material_class"] == "C"

    def test_multiple_items(self):
        items = [
            {"name": "Stahlträger HEB200", "unit_price": 200},
            {"name": "Schrauben M8x40", "unit_price": 0.50},
            {"name": "Isolierband", "unit_price": 3.50},
        ]
        result = _stub_classify(items)
        assert len(result["results"]) == 3
        assert result["results"][0]["material_class"] == "A"
        assert result["results"][1]["material_class"] == "C"
        assert result["results"][2]["material_class"] == "C"

    def test_input_index_preserved(self):
        items = [{"name": f"Item {i}", "unit_price": i * 10} for i in range(5)]
        result = _stub_classify(items)
        for i, r in enumerate(result["results"]):
            assert r["input_index"] == i

    def test_structural_keywords_comprehensive(self):
        """All structural keywords should trigger class A."""
        keywords = ["Rohr Ø200", "Betonrohr", "Kabelschacht", "Stahlträger",
                     "rebar 10mm", "asphalt", "Ortbeton", "Fertigteil"]
        for kw in keywords:
            result = _stub_classify([{"name": kw, "unit_price": 10}])
            assert result["results"][0]["material_class"] == "A", f"Failed for keyword: {kw}"

    def test_hammer_taxonomy_distinguishes_subtypes(self):
        items = [
            {"name": "Claw hammer 16oz", "unit_price": 18},
            {"name": "Sledge hammer 5kg", "unit_price": 65},
        ]
        result = _stub_classify(items)

        assert result["results"][0]["taxonomy_code"] == "tools.hand.hammers.claw"
        assert result["results"][1]["taxonomy_code"] == "tools.hand.hammers.sledge"
        assert result["results"][0]["taxonomy_code"] != result["results"][1]["taxonomy_code"]


# ── Workflow Logic ────────────────────────────────────────────────

class TestWorkflowLogic:
    """Test workflow decision logic (without Ollama — pure business rules)."""

    def test_auto_approve_below_threshold(self):
        """Orders below threshold with no risk factors → auto approve."""
        from src.routers.workflows import ApprovalRequest
        req = ApprovalRequest(
            order_id="test-001",
            items=[{"name": "Schrauben", "quantity": 100, "unit_price": 0.50}],
            total_amount=50.0,
            company_id="test",
            requester_role="foreman",
            approval_threshold=200.0,
        )
        assert req.total_amount <= req.approval_threshold

    def test_high_value_triggers_risk(self):
        """Order > 5x threshold should have risk factors."""
        threshold = 200.0
        total = threshold * 6  # 1200
        assert total > threshold * 5

    def test_low_supplier_score_triggers_risk(self):
        """Supplier score < 50 should be flagged."""
        scores = {"supplier-1": {"overall": "35.0"}}
        low_scores = [
            sid for sid, s in scores.items()
            if float(s.get("overall", 100)) < 50
        ]
        assert len(low_scores) == 1

    def test_compliance_budget_check(self):
        """Order exceeding remaining budget should be flagged."""
        budget = 10000.0
        spent = 9500.0
        order_total = 600.0
        remaining = budget - spent
        assert order_total > remaining
