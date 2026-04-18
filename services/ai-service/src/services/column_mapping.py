"""Calls the LLM column-mapper prompt and returns parsed mapping result."""
from typing import Any

from ..llm.anthropic_client import call_claude_json
from ..prompts import column_mapper as cm


def _stub_mapping(columns: list[dict]) -> dict:
    """Heuristic stub for offline mode — naive lowercase substring match."""
    keymap = {
        "name": ["name", "bezeichnung", "designation", "descrizione"],
        "sku": ["sku", "art", "artikel"],
        "unit": ["unit", "einheit", "uom"],
        "unit_price": ["price", "preis", "prix"],
        "currency": ["currency", "währ", "ccy"],
        "category": ["category", "kategorie", "gruppe"],
        "manufacturer": ["manufact", "hersteller", "marke", "brand"],
    }
    mappings = []
    for c in columns:
        chosen = None
        cl = c["name"].lower()
        for tgt, kws in keymap.items():
            if any(k in cl for k in kws):
                chosen = tgt
                break
        mappings.append({
            "source_column": c["name"],
            "target_field": chosen,
            "confidence": 0.6 if chosen else 0.0,
            "reason": "heuristic" if chosen else "no match",
        })
    return {
        "mappings": mappings,
        "language_detected": "unknown",
        "currency_detected": "unknown",
        "warnings": ["LLM unavailable — used heuristic stub"],
    }


async def map_columns(columns: list[dict]) -> dict[str, Any]:
    return await call_claude_json(
        system=cm.SYSTEM,
        messages=cm.build_messages(columns),
        max_tokens=1500,
        temperature=0.0,
        stub=_stub_mapping(columns),
    )
