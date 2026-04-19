from decimal import Decimal

from src.recommendations import build_product_recommendations, compute_effective_unit_price


def test_effective_unit_price_applies_standard_and_bulk_discounts():
    product = {
        "unit_price": Decimal("10.00"),
        "base_discount_pct": Decimal("5.00"),
        "bulk_discount_pct": Decimal("10.00"),
        "bulk_discount_threshold": Decimal("100"),
    }

    assert compute_effective_unit_price(product, Decimal("20")) == Decimal("9.50")
    assert compute_effective_unit_price(product, Decimal("100")) == Decimal("8.55")


def test_recommendations_label_best_cheapest_and_fastest():
    ranked = build_product_recommendations(
        [
            {
                "id": "a",
                "sku": "BEST-1",
                "name": "Claw hammer 16oz",
                "supplier_name": "Balanced Build",
                "unit_price": Decimal("18.50"),
                "expected_delivery_days": Decimal("2.0"),
                "must_order": False,
            },
            {
                "id": "b",
                "sku": "CHEAP-1",
                "name": "Claw hammer economy",
                "supplier_name": "Budget Trade",
                "unit_price": Decimal("16.90"),
                "expected_delivery_days": Decimal("5.0"),
                "must_order": False,
            },
            {
                "id": "c",
                "sku": "FAST-1",
                "name": "Claw hammer express",
                "supplier_name": "Rapid Supply",
                "unit_price": Decimal("19.10"),
                "expected_delivery_days": Decimal("1.0"),
                "must_order": False,
            },
        ],
        requested_quantity=Decimal("8"),
    )

    assert ranked[0]["recommendation_bucket"] == "best_score"
    assert any(item["recommendation_bucket"] == "cheapest" for item in ranked)
    assert any(item["recommendation_bucket"] == "fastest" for item in ranked)
    assert ranked[0]["overall_score"] >= ranked[-1]["overall_score"]


def test_recommendations_prefer_high_delivery_confidence_when_price_and_eta_tie():
    ranked = build_product_recommendations(
        [
            {
                "id": "low-confidence",
                "sku": "HAM-LOW",
                "name": "Budget hammer",
                "supplier_name": "Budget Trade",
                "unit_price": Decimal("19.00"),
                "expected_delivery_days": Decimal("2.0"),
                "delivery_confidence": Decimal("0.35"),
                "must_order": False,
            },
            {
                "id": "high-confidence",
                "sku": "HAM-HIGH",
                "name": "Reliable hammer",
                "supplier_name": "Reliable Supply",
                "unit_price": Decimal("19.00"),
                "expected_delivery_days": Decimal("2.0"),
                "delivery_confidence": Decimal("0.95"),
                "must_order": False,
            },
        ],
        requested_quantity=Decimal("2"),
    )

    assert ranked[0]["id"] == "high-confidence"
    assert ranked[0]["overall_score"] > ranked[1]["overall_score"]
