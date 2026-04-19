from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Mapping

PRICE_WEIGHT = Decimal("0.60")
DELIVERY_WEIGHT = Decimal("0.40")
MUST_ORDER_BONUS = Decimal("5.00")
_TWO_PLACES = Decimal("0.01")


def _to_decimal(value: object, default: Decimal | None = None) -> Decimal | None:
    if value is None or value == "":
        return default
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception:  # noqa: BLE001
        return default


def compute_effective_unit_price(
    product: Mapping[str, object],
    requested_quantity: Decimal | int | float | str = Decimal("1"),
) -> Decimal:
    quantity = _to_decimal(requested_quantity, Decimal("1")) or Decimal("1")
    unit_price = _to_decimal(product.get("unit_price"), Decimal("0")) or Decimal("0")
    base_discount_pct = max(Decimal("0"), min(Decimal("100"), _to_decimal(product.get("base_discount_pct"), Decimal("0")) or Decimal("0")))
    bulk_discount_pct = max(Decimal("0"), min(Decimal("100"), _to_decimal(product.get("bulk_discount_pct"), Decimal("0")) or Decimal("0")))
    bulk_threshold = _to_decimal(product.get("bulk_discount_threshold"))

    discounted = unit_price * (Decimal("1") - (base_discount_pct / Decimal("100")))
    if bulk_threshold is not None and bulk_threshold > 0 and quantity >= bulk_threshold:
        discounted *= Decimal("1") - (bulk_discount_pct / Decimal("100"))

    return discounted.quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)


def _score_from_range(value: Decimal, low: Decimal, high: Decimal, invert: bool = False) -> Decimal:
    if high <= low:
        return Decimal("100.00")
    ratio = (value - low) / (high - low)
    if invert:
        ratio = Decimal("1") - ratio
    score = max(Decimal("0"), min(Decimal("100"), ratio * Decimal("100")))
    return score.quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)


def build_product_recommendations(
    candidates: Iterable[Mapping[str, object]],
    requested_quantity: Decimal | int | float | str = Decimal("1"),
    *,
    price_weight: Decimal | int | float | str = PRICE_WEIGHT,
    delivery_weight: Decimal | int | float | str = DELIVERY_WEIGHT,
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    quantity = _to_decimal(requested_quantity, Decimal("1")) or Decimal("1")
    price_weight_dec = _to_decimal(price_weight, PRICE_WEIGHT) or PRICE_WEIGHT
    delivery_weight_dec = _to_decimal(delivery_weight, DELIVERY_WEIGHT) or DELIVERY_WEIGHT

    for candidate in candidates:
        effective_price = compute_effective_unit_price(candidate, quantity)
        expected_delivery = _to_decimal(candidate.get("expected_delivery_days"))
        rows.append({
            **dict(candidate),
            "effective_unit_price": effective_price,
            "expected_delivery_days": expected_delivery,
            "must_order": bool(candidate.get("must_order", False)),
        })

    if not rows:
        return []

    prices = [row["effective_unit_price"] for row in rows if isinstance(row["effective_unit_price"], Decimal)]
    min_price = min(prices) if prices else Decimal("0")
    max_price = max(prices) if prices else min_price

    known_delivery = [
        row["expected_delivery_days"]
        for row in rows
        if isinstance(row.get("expected_delivery_days"), Decimal)
    ]
    min_delivery = min(known_delivery) if known_delivery else None
    max_delivery = max(known_delivery) if known_delivery else None

    for row in rows:
        price_score = _score_from_range(row["effective_unit_price"], min_price, max_price, invert=True)
        if min_delivery is None or max_delivery is None or row.get("expected_delivery_days") is None:
            delivery_score = Decimal("50.00")
        else:
            delivery_score = _score_from_range(row["expected_delivery_days"], min_delivery, max_delivery, invert=True)

        overall = (price_score * price_weight_dec) + (delivery_score * delivery_weight_dec)
        if row.get("must_order"):
            overall += MUST_ORDER_BONUS
        overall = max(Decimal("0"), min(Decimal("100"), overall)).quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)

        row["price_score"] = price_score
        row["delivery_score"] = delivery_score
        row["overall_score"] = overall

    rows.sort(
        key=lambda row: (
            -(row.get("overall_score") or Decimal("0")),
            row.get("effective_unit_price") or Decimal("999999"),
            row.get("expected_delivery_days") if row.get("expected_delivery_days") is not None else Decimal("999999"),
            str(row.get("name") or ""),
        )
    )

    best_id = rows[0].get("id")
    used_bucket_ids = {best_id}

    cheapest_pool = [row for row in rows if row.get("id") not in used_bucket_ids] or rows
    cheapest_id = min(cheapest_pool, key=lambda row: row.get("effective_unit_price") or Decimal("999999")).get("id")
    used_bucket_ids.add(cheapest_id)

    all_fastest_candidates = [row for row in rows if row.get("expected_delivery_days") is not None]
    fastest_pool = [row for row in all_fastest_candidates if row.get("id") not in used_bucket_ids] or all_fastest_candidates
    fastest_id = min(
        fastest_pool,
        key=lambda row: row.get("expected_delivery_days") or Decimal("999999"),
    ).get("id") if fastest_pool else None

    absolute_cheapest_id = min(rows, key=lambda row: row.get("effective_unit_price") or Decimal("999999")).get("id")
    absolute_fastest_id = min(
        all_fastest_candidates,
        key=lambda row: row.get("expected_delivery_days") or Decimal("999999"),
    ).get("id") if all_fastest_candidates else None

    for row in rows:
        tags: list[str] = []
        bucket = "alternative"
        if row.get("id") == best_id:
            bucket = "best_score"
        elif row.get("id") == cheapest_id:
            bucket = "cheapest"
        elif fastest_id is not None and row.get("id") == fastest_id:
            bucket = "fastest"

        tags.append(bucket)
        if row.get("id") == absolute_cheapest_id and "lowest_price" not in tags:
            tags.append("lowest_price")
        if absolute_fastest_id is not None and row.get("id") == absolute_fastest_id and "lowest_eta" not in tags:
            tags.append("lowest_eta")

        row["recommendation_tags"] = tags
        row["recommendation_bucket"] = bucket

    return rows
