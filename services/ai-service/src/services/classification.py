"""LLM-assisted A/B/C classification (§5.2) with deterministic fallback."""
from typing import Any

from ..llm.anthropic_client import call_claude_json
from ..prompts import c_material_classifier as cmc


def _fallback_classify(items: list[dict]) -> dict:
    """Evidence-based local classifier used when a remote model is unavailable."""
    a_keywords = (
        "rebar", "stahlträger", "beam", "concrete", "beton", "asphalt",
        "cable duct", "kabelschacht", "pipe", "rohr", "anchor rail",
        "structural", "fertigteil", "bewehr",
    )
    b_keywords = (
        "anchor", "fastener", "membrane", "insulation", "adhesive",
        "sealant", "valve", "pump", "drywall", "suspension", "bracket",
    )
    c_keywords = (
        "screw", "bolt", "washer", "tape", "glove", "consumable",
        "clip", "spacer", "foam", "nail",
    )

    results = []
    for i, it in enumerate(items):
        price = float(it.get("unit_price") or 0)
        text = " ".join(
            str(v) for v in [it.get("name"), it.get("category"), it.get("description")]
            if v
        ).lower()

        evidence: list[str] = []
        material_class = "C"
        confidence = 0.58

        if any(k in text for k in a_keywords):
            material_class = "A"
            confidence = 0.82
            evidence.append("structural keyword or heavy-duty material signal")
        elif any(k in text for k in b_keywords):
            material_class = "B"
            confidence = 0.72
            evidence.append("trade-critical installation component")
        elif any(k in text for k in c_keywords):
            evidence.append("standard consumable or accessory")

        if price >= 120:
            material_class = "A"
            confidence = max(confidence, 0.8)
            evidence.append(f"high unit price ({price:.2f})")
        elif price >= 50 and material_class == "C":
            material_class = "B"
            confidence = max(confidence, 0.68)
            evidence.append(f"mid-range unit price ({price:.2f})")
        elif price > 0:
            evidence.append(f"lower unit price ({price:.2f})")

        results.append({
            "input_index": i,
            "material_class": material_class,
            "confidence": round(confidence, 2),
            "category": it.get("category") or "Unknown",
            "rationale": "; ".join(evidence) or "limited evidence, defaulted to consumable class",
        })

    return {"results": results}


def _stub_classify(items: list[dict]) -> dict:
    """Backward-compatible deterministic classifier used by tests and offline flows."""
    return _fallback_classify(items)


async def classify(items: list[dict]) -> dict[str, Any]:
    return await call_claude_json(
        system=cmc.SYSTEM,
        messages=cmc.build_messages(items),
        max_tokens=2048,
        temperature=0.0,
        stub=_stub_classify(items),
    )
