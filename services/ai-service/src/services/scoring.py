"""Supplier scoring engine.

Computes composite scores from price history, delivery performance,
interaction history, web reputation, and model-assisted specs fit.
Falls back to an evidence-based local assessment when model output is unavailable.
Stores results in procurement.supplier_scores.
"""
import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import httpx

from ..config import settings
from ..llm.ollama_client import call_ollama_json

logger = logging.getLogger(__name__)


def _compute_specs_fit_local(cached: dict) -> tuple[int, str]:
    hits = cached.get("search_results") or cached.get("hits") or cached.get("results") or []
    combined_text = ""
    if isinstance(hits, list):
        for hit in hits[:8]:
            if isinstance(hit, dict):
                combined_text += f" {hit.get('title', '')} {hit.get('snippet', '')}"
    combined_text = combined_text.lower()

    score = 45
    reasons: list[str] = []

    if any(token in combined_text for token in ["construction", "baustoff", "building", "civil", "contractor"]):
        score += 20
        reasons.append("construction-sector relevance")
    if any(token in combined_text for token in ["switzerland", "schweiz", "zurich", "basel", "bern", "geneva"]):
        score += 10
        reasons.append("swiss market presence")
    if any(token in combined_text for token in ["wholesale", "supplier", "trade", "b2b", "distribution"]):
        score += 10
        reasons.append("trade or B2B supply signals")
    if any(token in combined_text for token in ["iso", "certified", "certification", "ce", "en 1090"]):
        score += 10
        reasons.append("quality or certification signals")
    if any(token in combined_text for token in ["complaint", "delayed", "unreliable", "poor", "bad"]):
        score -= 15
        reasons.append("negative public reliability signals")

    score = max(0, min(100, score))
    reasoning = "; ".join(reasons) if reasons else "limited public evidence available"
    return score, reasoning

# Weight configuration for composite scoring
SCORE_WEIGHTS = {
    "price": 0.25,
    "delivery": 0.25,
    "trust": 0.15,
    "quality_web": 0.20,   # from web search reputation
    "specs_fit": 0.15,      # how well supplier specs match requirements
}


_scoring_pool = None


async def _db_pool():
    """Get an asyncpg connection pool (lazy singleton)."""
    global _scoring_pool
    import asyncpg
    if _scoring_pool is None:
        _scoring_pool = await asyncpg.create_pool(
            settings.DATABASE_URL.replace("+asyncpg", ""),
            min_size=2, max_size=5,
        )
    return _scoring_pool


async def compute_supplier_score(supplier_id: str) -> dict:
    """Compute and store a composite score for a supplier."""
    pool = await _db_pool()
    async with pool.acquire() as conn:
        # Price score: based on competitive positioning
        price_rows = await conn.fetch("""
            SELECT ph.unit_price, ph.product_id,
                   AVG(ph2.unit_price) AS market_avg
            FROM procurement.price_history ph
            JOIN procurement.price_history ph2
                ON ph2.product_id = ph.product_id
                AND ph2.recorded_at > NOW() - INTERVAL '90 days'
            WHERE ph.supplier_id = $1
                AND ph.recorded_at > NOW() - INTERVAL '90 days'
            GROUP BY ph.unit_price, ph.product_id
        """, uuid.UUID(supplier_id))

        price_score = Decimal("50.0")  # neutral default
        if price_rows:
            ratios = []
            for row in price_rows:
                if row["market_avg"] and row["market_avg"] > 0:
                    ratio = float(row["unit_price"]) / float(row["market_avg"])
                    ratios.append(ratio)
            if ratios:
                avg_ratio = sum(ratios) / len(ratios)
                # Score: 100 if 30% cheaper, 50 at market avg, 0 if 50% more expensive
                price_score = Decimal(str(max(0, min(100, 100 - (avg_ratio - 0.7) * 166.67))))

        # Delivery score: on-time rate from interactions
        delivery_rows = await conn.fetch("""
            SELECT rating, COUNT(*) as cnt
            FROM procurement.supplier_interactions
            WHERE supplier_id = $1
                AND interaction_type = 'order'
                AND rating IS NOT NULL
            GROUP BY rating
        """, uuid.UUID(supplier_id))

        delivery_score = Decimal("50.0")
        total_deliveries = sum(r["cnt"] for r in delivery_rows) if delivery_rows else 0
        if total_deliveries > 0:
            weighted = sum(r["rating"] * r["cnt"] for r in delivery_rows)
            delivery_score = Decimal(str(round((weighted / total_deliveries) * 20, 2)))

        # Trust score: based on number of interactions + dispute rate
        trust_rows = await conn.fetch("""
            SELECT interaction_type, COUNT(*) as cnt
            FROM procurement.supplier_interactions
            WHERE supplier_id = $1
            GROUP BY interaction_type
        """, uuid.UUID(supplier_id))

        trust_score = Decimal("50.0")
        if trust_rows:
            type_counts = {r["interaction_type"]: r["cnt"] for r in trust_rows}
            total = sum(type_counts.values())
            disputes = type_counts.get("dispute", 0)
            if total > 0:
                dispute_rate = disputes / total
                experience_bonus = min(20, total * 2)  # up to 20 pts for volume
                trust_score = Decimal(str(round(
                    max(0, min(100, 80 - dispute_rate * 100 + experience_bonus)), 2
                )))

        # Quality score from web search reputation
        quality_web_score = Decimal("50.0")  # neutral default
        web_cache_row = await conn.fetchrow("""
            SELECT results FROM procurement.web_search_cache
            WHERE supplier_id = $1
            ORDER BY searched_at DESC LIMIT 1
        """, uuid.UUID(supplier_id))

        if web_cache_row and web_cache_row["results"]:
            import json
            try:
                cached = json.loads(web_cache_row["results"])
                rep = cached.get("reputation_score", 50)
                quality_web_score = Decimal(str(max(0, min(100, rep))))
            except Exception:
                pass

        # Specs-fit score starts from a neutral local baseline and is refined when evidence exists.
        specs_fit_score = Decimal("50.0")

        # Try AI-powered specs fit if supplier has web data
        if web_cache_row and web_cache_row["results"]:
            try:
                specs_fit_score = await _compute_specs_fit_ai(
                    supplier_id, web_cache_row["results"],
                )
            except Exception as exc:
                logger.warning("AI specs-fit failed for %s: %s", supplier_id, exc)

        # Composite
        overall = (
            price_score * Decimal(str(SCORE_WEIGHTS["price"]))
            + delivery_score * Decimal(str(SCORE_WEIGHTS["delivery"]))
            + trust_score * Decimal(str(SCORE_WEIGHTS["trust"]))
            + quality_web_score * Decimal(str(SCORE_WEIGHTS["quality_web"]))
            + specs_fit_score * Decimal(str(SCORE_WEIGHTS["specs_fit"]))
        )

        now = datetime.now(timezone.utc)
        scores = {
            "price": price_score,
            "delivery": delivery_score,
            "trust": trust_score,
            "quality_web": quality_web_score,
            "specs_fit": specs_fit_score,
            "overall": overall.quantize(Decimal("0.01")),
        }

        # Upsert scores
        for score_type, score_value in scores.items():
            await conn.execute("""
                INSERT INTO procurement.supplier_scores
                    (id, supplier_id, score_type, score_value, sample_size, computed_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (supplier_id, score_type)
                    DO UPDATE SET score_value = $4, sample_size = $5, computed_at = $6
            """, uuid.uuid4(), uuid.UUID(supplier_id), score_type,
                score_value, total_deliveries, now)

        return {
            "supplier_id": supplier_id,
            "scores": {k: str(v) for k, v in scores.items()},
            "sample_size": total_deliveries,
            "computed_at": now.isoformat(),
        }


async def compare_suppliers(product_id: str, supplier_ids: list[str] | None = None) -> dict:
    """Compare suppliers for a specific product based on price and scores."""
    pool = await _db_pool()
    async with pool.acquire() as conn:
        # Get latest prices per supplier for this product
        query = """
            SELECT DISTINCT ON (ph.supplier_id)
                ph.supplier_id, ph.unit_price, ph.currency, ph.recorded_at,
                ss.score_value as overall_score
            FROM procurement.price_history ph
            LEFT JOIN procurement.supplier_scores ss
                ON ss.supplier_id = ph.supplier_id AND ss.score_type = 'overall'
            WHERE ph.product_id = $1
        """
        params: list = [uuid.UUID(product_id)]

        if supplier_ids:
            query += " AND ph.supplier_id = ANY($2)"
            params.append([uuid.UUID(s) for s in supplier_ids])

        query += " ORDER BY ph.supplier_id, ph.recorded_at DESC"

        rows = await conn.fetch(query, *params)

        comparisons = []
        for row in rows:
            comparisons.append({
                "supplier_id": str(row["supplier_id"]),
                "unit_price": str(row["unit_price"]),
                "currency": row["currency"],
                "overall_score": str(row["overall_score"]) if row["overall_score"] else None,
                "price_date": row["recorded_at"].isoformat() if row["recorded_at"] else None,
            })

        # Sort by composite: 60% score, 40% price (lower is better), with bounded normalization.
        if comparisons:
            prices = [float(c["unit_price"]) for c in comparisons]
            min_price = min(prices) if prices else 0
            max_price = max(prices) if prices else min_price
            price_range = max(max_price - min_price, 0.01)

            for c in comparisons:
                score = float(c["overall_score"] or 50)
                price = float(c["unit_price"])
                if max_price == min_price:
                    price_norm = 100.0
                else:
                    price_norm = max(0.0, min(100.0, (1 - ((price - min_price) / price_range)) * 100))
                c["composite_rank"] = round(score * 0.6 + price_norm * 0.4, 2)
            comparisons.sort(key=lambda c: c["composite_rank"], reverse=True)

        return {
            "product_id": product_id,
            "comparisons": comparisons,
            "recommendation": comparisons[0]["supplier_id"] if comparisons else None,
        }


async def _compute_specs_fit_ai(supplier_id: str, web_cache_json: str) -> Decimal:
    """Use Ollama to evaluate how well a supplier fits construction material needs."""
    import json as _json
    try:
        cached = _json.loads(web_cache_json)
    except Exception:
        return Decimal("50.0")

    local_score, local_reason = _compute_specs_fit_local(cached)

    snippets = ""
    hits = cached.get("search_results") or cached.get("hits") or cached.get("results", [])
    if isinstance(hits, list):
        for h in hits[:5]:
            if isinstance(h, dict):
                snippets += f"- {h.get('title', '')} : {h.get('snippet', '')}\n"
    if not snippets:
        snippets = str(cached)[:600]

    result = await call_ollama_json(
        system=(
            "You are a construction procurement analyst evaluating suppliers. "
            "Score how well a supplier matches Swiss construction material procurement needs. "
            "Consider: product range breadth, specialization in construction/building, "
            "Swiss market presence, B2B capabilities, certifications mentioned."
        ),
        messages=[{
            "role": "user",
            "content": (
                f"Rate this supplier (ID {supplier_id}) based on the following web data:\n\n"
                f"{snippets}\n\n"
                "Return JSON: {\"specs_fit_score\": <0-100>, \"reasoning\": \"<brief>\"}"
            ),
        }],
        max_tokens=256,
        temperature=0.2,
        stub={"specs_fit_score": local_score, "reasoning": local_reason},
    )
    raw = result.get("specs_fit_score", 50)
    return Decimal(str(max(0, min(100, int(raw)))))


async def get_supplier_score_breakdown(supplier_id: str) -> dict:
    """Retrieve the full score breakdown for a supplier from the DB."""
    pool = await _db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT score_type, score_value, sample_size, computed_at
            FROM procurement.supplier_scores
            WHERE supplier_id = $1
            ORDER BY score_type
        """, uuid.UUID(supplier_id))

    if not rows:
        return {"supplier_id": supplier_id, "scores": {}, "computed_at": None}

    scores = {}
    latest_at = None
    sample = 0
    for r in rows:
        scores[r["score_type"]] = {
            "value": str(r["score_value"]),
            "sample_size": r["sample_size"],
        }
        if r["computed_at"] and (latest_at is None or r["computed_at"] > latest_at):
            latest_at = r["computed_at"]
            sample = r["sample_size"]

    return {
        "supplier_id": supplier_id,
        "scores": scores,
        "weights": SCORE_WEIGHTS,
        "sample_size": sample,
        "computed_at": latest_at.isoformat() if latest_at else None,
    }
