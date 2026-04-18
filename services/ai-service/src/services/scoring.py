"""Supplier scoring engine.

Computes composite scores from price history, delivery performance,
and interaction history. Stores results in procurement.supplier_scores.
"""
import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

# Weight configuration for composite scoring
SCORE_WEIGHTS = {
    "price": 0.35,
    "delivery": 0.30,
    "trust": 0.20,
    "quality": 0.15,
}


async def _db_pool():
    """Get an asyncpg connection pool (lazy singleton)."""
    import asyncpg
    if not hasattr(_db_pool, "_pool"):
        _db_pool._pool = await asyncpg.create_pool(
            settings.DATABASE_URL.replace("+asyncpg", ""),
            min_size=2, max_size=5,
        )
    return _db_pool._pool


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

        # Composite
        overall = (
            price_score * Decimal(str(SCORE_WEIGHTS["price"]))
            + delivery_score * Decimal(str(SCORE_WEIGHTS["delivery"]))
            + trust_score * Decimal(str(SCORE_WEIGHTS["trust"]))
            + Decimal("50.0") * Decimal(str(SCORE_WEIGHTS["quality"]))  # placeholder
        )

        now = datetime.now(timezone.utc)
        scores = {
            "price": price_score,
            "delivery": delivery_score,
            "trust": trust_score,
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

        # Sort by composite: 60% score, 40% price (lower is better)
        if comparisons:
            prices = [float(c["unit_price"]) for c in comparisons]
            min_price = min(prices) if prices else 1
            for c in comparisons:
                score = float(c["overall_score"] or 50)
                price_norm = (1 - (float(c["unit_price"]) - min_price) / max(min_price, 1)) * 100
                c["composite_rank"] = round(score * 0.6 + price_norm * 0.4, 2)
            comparisons.sort(key=lambda c: c["composite_rank"], reverse=True)

        return {
            "product_id": product_id,
            "comparisons": comparisons,
            "recommendation": comparisons[0]["supplier_id"] if comparisons else None,
        }
