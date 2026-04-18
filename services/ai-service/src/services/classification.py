"""LLM-driven A/B/C classification (§5.2)."""
from typing import Any

from ..llm.anthropic_client import call_claude_json
from ..prompts import c_material_classifier as cmc


def _stub_classify(items: list[dict]) -> dict:
    """Deterministic stub: price-only heuristic.

    >100 CHF -> A, >50 CHF -> B, else C. Plus structural keyword heuristic.
    Used in tests + when ANTHROPIC_API_KEY is missing.
    """
    A_KEYWORDS = ("rohr ø", "betonrohr", "kabelschacht", "stahlträger",
                  "rebar", "asphalt", "ortbeton", "fertigteil")
    results = []
    for i, it in enumerate(items):
        price = it.get("unit_price") or 0
        name = (it.get("name") or "").lower()
        cls = "C"
        rationale = "low-value consumable (heuristic)"
        if any(k in name for k in A_KEYWORDS):
            cls, rationale = "A", "structural element keyword (heuristic)"
        elif price and float(price) > 100:
            cls, rationale = "A", f"unit price {price} > 100 CHF (heuristic)"
        elif price and float(price) > 50:
            cls, rationale = "B", f"unit price {price} > 50 CHF (heuristic)"
        results.append({
            "input_index": i,
            "material_class": cls,
            "confidence": 0.6,
            "category": it.get("category") or "Unknown",
            "rationale": rationale,
        })
    return {"results": results}


async def classify(items: list[dict]) -> dict[str, Any]:
    return await call_claude_json(
        system=cmc.SYSTEM,
        messages=cmc.build_messages(items),
        max_tokens=2048,
        temperature=0.0,
        stub=_stub_classify(items),
    )
