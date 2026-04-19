"""Approval engine tests covering all 4 branches in spec §8."""
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.services.approval_engine import ApprovalEngine
from src.services.request_risk import _derive_product_tag


def _item(
    category: str = "Fasteners",
    material_class: str = "C",
    line_total: str = "10.00",
    *,
    quantity: str = "1",
    name: str = "Generic item",
    unit: str = "pc",
    taxonomy_code: str | None = None,
    taxonomy_label: str | None = None,
):
    return SimpleNamespace(
        product_id=uuid4(),
        quantity=Decimal(quantity),
        unit=unit,
        product_snapshot={
            "name": name,
            "category": category,
            "material_class": material_class,
            "unit": unit,
            "taxonomy_code": taxonomy_code,
            "taxonomy_label": taxonomy_label,
        },
        line_total=Decimal(line_total),
    )


def _order(total: str, items, currency: str = "CHF"):
    return SimpleNamespace(
        company_id=uuid4(),
        total_amount=Decimal(total),
        currency=currency,
        items=items,
    )


def _engine_with_rule(rule):
    db = AsyncMock()
    engine = ApprovalEngine(db)
    engine._get_rule = AsyncMock(return_value=rule)
    engine._request_risk = AsyncMock(
        return_value={"requires_review": False, "risk_score": 0.0, "signals": []}
    )
    return engine


@pytest.mark.asyncio
async def test_below_default_threshold_auto_approves():
    engine = _engine_with_rule(None)
    order = _order("50.00", [_item(line_total="50.00")])
    requires, reason = await engine.evaluate(order)
    assert requires is False
    assert reason is None


@pytest.mark.asyncio
async def test_high_value_order_auto_approves_when_statistically_normal():
    engine = _engine_with_rule(None)
    order = _order("250.00", [_item(line_total="250.00", quantity="24", name="Painter brush 50mm")])
    requires, reason = await engine.evaluate(order)
    assert requires is False
    assert reason is None


@pytest.mark.asyncio
async def test_custom_threshold_is_advisory_when_statistics_are_normal():
    rule = SimpleNamespace(
        threshold_amount=Decimal("500.00"),
        restricted_categories=[],
    )
    engine = _engine_with_rule(rule)
    requires, _ = await engine.evaluate(_order("400.00", [_item(line_total="400.00", quantity="20")]))
    assert requires is False
    requires, reason = await engine.evaluate(_order("500.00", [_item(line_total="500.00", quantity="22")]))
    assert requires is False
    assert reason is None


@pytest.mark.asyncio
async def test_restricted_category_branch():
    rule = SimpleNamespace(
        threshold_amount=Decimal("10000.00"),
        restricted_categories=["Tools"],
    )
    engine = _engine_with_rule(rule)
    order = _order("50.00", [_item(category="Tools", line_total="50.00")])
    requires, reason = await engine.evaluate(order)
    assert requires is True
    assert "restricted categories" in reason
    assert "Tools" in reason


@pytest.mark.asyncio
async def test_a_material_defensive_branch():
    rule = SimpleNamespace(
        threshold_amount=Decimal("10000.00"),
        restricted_categories=[],
    )
    engine = _engine_with_rule(rule)
    order = _order("5.00", [_item(material_class="A", line_total="5.00")])
    requires, reason = await engine.evaluate(order)
    assert requires is True
    assert "A-materials" in reason


@pytest.mark.asyncio
async def test_statistical_risk_branch():
    rule = SimpleNamespace(
        threshold_amount=Decimal("10000.00"),
        restricted_categories=[],
    )
    engine = _engine_with_rule(rule)
    engine._request_risk = AsyncMock(return_value={
        "requires_review": True,
        "risk_score": 0.93,
        "signals": [{
            "name": "Work Gloves",
            "expected_quantity": 42.0,
            "historical_stddev": 8.5,
        }],
    })
    requires, reason = await engine.evaluate(_order("50.00", [_item(line_total="50.00")]))
    assert requires is True
    assert "Quantity anomaly detected" in reason
    assert "expected" in reason.lower()


@pytest.mark.asyncio
async def test_statistical_baseline_overrides_fixed_thresholds_for_normal_orders():
    engine = _engine_with_rule(None)
    order = _order(
        "250.00",
        [
            _item(
                category="Consumables > Brushes",
                name="Painter brush 50mm",
                quantity="24",
                line_total="250.00",
            )
        ],
    )
    requires, reason = await engine.evaluate(order)
    assert requires is False
    assert reason is None


def test_ai_like_family_tags_group_similar_products_together():
    assert _derive_product_tag({
        "name": "Painter brush 50mm",
        "category": "Consumables > Finishing",
        "material_class": "C",
    }) == "brushes"
    assert _derive_product_tag({
        "name": "Malerpinsel Set",
        "category": "Site supplies",
        "material_class": "C",
    }) == "brushes"
    assert _derive_product_tag({
        "name": "Schlosserhammer 500g",
        "category": "Tools",
        "material_class": "C",
    }) == "hammers"


def test_taxonomy_code_is_used_for_subcategory_grouping():
    assert _derive_product_tag({
        "name": "Claw hammer 16oz",
        "category": "Tools",
        "taxonomy_code": "tools.hand.hammers.claw",
        "material_class": "C",
    }) == "tools.hand.hammers.claw"
    assert _derive_product_tag({
        "name": "Sledge hammer 5kg",
        "category": "Tools",
        "taxonomy_code": "tools.hand.hammers.sledge",
        "material_class": "C",
    }) == "tools.hand.hammers.sledge"


@pytest.mark.asyncio
async def test_restricted_taxonomy_branch():
    rule = SimpleNamespace(
        threshold_amount=Decimal("10000.00"),
        restricted_categories=["tools.hand.hammers.sledge"],
    )
    engine = _engine_with_rule(rule)
    order = _order(
        "65.00",
        [
            _item(
                category="Tools",
                name="Sledge hammer 5kg",
                taxonomy_code="tools.hand.hammers.sledge",
                taxonomy_label="Hand Tools > Hammers > Sledge Hammer",
                line_total="65.00",
            )
        ],
    )
    requires, reason = await engine.evaluate(order)
    assert requires is True
    assert "restricted" in (reason or "").lower()
    assert "sledge" in (reason or "").lower()
