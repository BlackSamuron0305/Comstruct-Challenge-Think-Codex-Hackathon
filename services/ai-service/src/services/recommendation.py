"""Task-based product recommendation (§5.3)."""
from typing import Any

from ..llm.anthropic_client import call_claude_json
from ..llm.openai_client import embed_one
from ..prompts import task_recommender as tr
from .catalog_client import search_by_vector


def _stub_recommend(task: str, candidates: list[dict]) -> dict:
    chosen = candidates[:3]
    return {
        "language": "en",
        "summary": f"Suggestion for: {task[:80]}" if chosen else "No matching C-materials found.",
        "items": [
            {
                "product_id": c["product_id"],
                "quantity": 1,
                "unit": c.get("unit", "pc"),
                "rationale": "heuristic top-match",
            }
            for c in chosen
        ],
        "missing": [] if chosen else ["LLM unavailable and no candidates"],
    }


async def recommend_for_task(
    task: str,
    *,
    project: str | None = None,
    trade: str | None = None,
    cart: list[dict] | None = None,
    limit: int = 12,
) -> dict[str, Any]:
    vector = await embed_one(task)
    candidates_raw = await search_by_vector(vector, limit=limit)
    candidates = [
        {
            "product_id": c["id"],
            "name": c["name"],
            "category": c.get("category"),
            "unit": c.get("unit"),
            "unit_price": c.get("unit_price"),
            "currency": c.get("currency"),
        }
        for c in candidates_raw
    ]
    response = await call_claude_json(
        system=tr.SYSTEM,
        messages=tr.build_messages(task, candidates, project=project, trade=trade, cart=cart),
        max_tokens=1500,
        temperature=0.2,
        stub=_stub_recommend(task, candidates),
    )
    # Enrich items with display info from candidates so the mobile app
    # can render without a second round-trip.
    by_id = {c["product_id"]: c for c in candidates}
    for it in response.get("items", []):
        meta = by_id.get(it.get("product_id"))
        if meta:
            it["name"] = meta["name"]
            it["unit_price"] = meta.get("unit_price")
            it["currency"] = meta.get("currency")
            it["category"] = meta.get("category")
    return response
