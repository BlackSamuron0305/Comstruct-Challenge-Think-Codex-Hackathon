"""Delta detection — compare extracted items against catalog DB.

After extracting products from any document (PDF, Excel, image), this module
checks each item against the catalog to determine:
- price_change: product exists (matched by SKU or name), price differs
- new_entry: no matching product found
- unchanged: product exists, same price
"""
from __future__ import annotations

import logging
import re
import uuid
from decimal import Decimal, InvalidOperation

import asyncpg

from ..config import settings

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


async def _db_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            settings.DATABASE_URL.replace("+asyncpg", ""),
            min_size=2,
            max_size=5,
        )
    return _pool


def _parse_price(val) -> Decimal | None:
    if val is None or val == "":
        return None
    try:
        s = str(val).replace("CHF", "").replace("EUR", "").replace("'", "").replace(",", ".").strip()
        return Decimal(s).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _normalise_name(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


async def detect_deltas(
    items: list[dict],
    supplier_id: str | None = None,
) -> list[dict]:
    """Compare extracted items against catalog.products.

    Returns each item annotated with:
    - delta_type: "new_entry" | "price_change" | "unchanged"
    - matched_product_id: UUID if matched
    - old_price / new_price: for price changes
    - price_diff_pct: percentage change
    """
    pool = await _db_pool()
    results: list[dict] = []

    async with pool.acquire() as conn:
        for item in items:
            sku = (item.get("sku") or "").strip()
            name = (item.get("name") or "").strip()
            new_price = _parse_price(item.get("unit_price"))

            if not name and not sku:
                results.append({**item, "delta_type": "skipped", "reason": "no name or sku"})
                continue

            # Try matching by exact supplier+SKU first, then normalized name within the same supplier.
            match = None
            supplier_uuid = None
            if supplier_id:
                try:
                    supplier_uuid = uuid.UUID(supplier_id)
                except ValueError:
                    supplier_uuid = None

            if sku and supplier_uuid:
                match = await conn.fetchrow(
                    """
                    SELECT id, sku, name, unit_price, currency
                    FROM catalog.products
                    WHERE supplier_id = $1 AND sku = $2 AND is_active = TRUE
                    ORDER BY updated_at DESC LIMIT 1
                    """,
                    supplier_uuid,
                    sku,
                )

            if not match and sku:
                match = await conn.fetchrow(
                    """
                    SELECT id, sku, name, unit_price, currency
                    FROM catalog.products
                    WHERE sku = $1 AND is_active = TRUE
                    ORDER BY updated_at DESC LIMIT 1
                    """,
                    sku,
                )

            if not match and name and supplier_uuid:
                normalized_name = _normalise_name(name)
                match = await conn.fetchrow(
                    """
                    SELECT id, sku, name, unit_price, currency
                    FROM catalog.products
                    WHERE supplier_id = $1
                      AND is_active = TRUE
                      AND regexp_replace(lower(name), '[^a-z0-9]+', '', 'g') = $2
                    ORDER BY updated_at DESC
                    LIMIT 1
                    """,
                    supplier_uuid,
                    normalized_name,
                )

            if not match and name:
                # Trigram similarity search (pg_trgm)
                match = await conn.fetchrow(
                    """
                    SELECT id, sku, name, unit_price, currency,
                           similarity(name, $1) AS sim
                    FROM catalog.products
                    WHERE is_active = TRUE
                      AND ($2::uuid IS NULL OR supplier_id = $2::uuid)
                      AND similarity(name, $1) > 0.55
                    ORDER BY sim DESC
                    LIMIT 1
                    """,
                    name,
                    supplier_uuid,
                )

            if match:
                old_price = match["unit_price"]
                product_id = str(match["id"])

                if new_price is not None and old_price is not None:
                    old_dec = Decimal(str(old_price)).quantize(Decimal("0.01"))
                    if new_price != old_dec:
                        diff_pct = float((new_price - old_dec) / old_dec * 100) if old_dec else 0.0
                        results.append({
                            **item,
                            "delta_type": "price_change",
                            "matched_product_id": product_id,
                            "matched_name": match["name"],
                            "matched_sku": match["sku"],
                            "old_price": float(old_dec),
                            "new_price": float(new_price),
                            "price_diff_pct": round(diff_pct, 2),
                            "currency": match["currency"],
                        })
                    else:
                        results.append({
                            **item,
                            "delta_type": "unchanged",
                            "matched_product_id": product_id,
                            "matched_name": match["name"],
                            "old_price": float(old_dec),
                        })
                else:
                    results.append({
                        **item,
                        "delta_type": "unchanged",
                        "matched_product_id": product_id,
                        "matched_name": match["name"],
                    })
            else:
                results.append({
                    **item,
                    "delta_type": "new_entry",
                })

    # Summary stats
    summary = {
        "total": len(results),
        "new_entries": sum(1 for r in results if r.get("delta_type") == "new_entry"),
        "price_changes": sum(1 for r in results if r.get("delta_type") == "price_change"),
        "unchanged": sum(1 for r in results if r.get("delta_type") == "unchanged"),
        "skipped": sum(1 for r in results if r.get("delta_type") == "skipped"),
    }
    logger.info(
        "Delta detection: %d items → %d new, %d price changes, %d unchanged",
        summary["total"],
        summary["new_entries"],
        summary["price_changes"],
        summary["unchanged"],
    )

    return results
