"""Approval engine tests covering all 4 branches in spec §8."""
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.services.approval_engine import ApprovalEngine


def _item(category: str = "Fasteners", material_class: str = "C", line_total: str = "10.00"):
    return SimpleNamespace(
        product_snapshot={"category": category, "material_class": material_class},
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
async def test_at_or_above_default_threshold_requires_approval():
    engine = _engine_with_rule(None)
    order = _order("250.00", [_item(line_total="250.00")])
    requires, reason = await engine.evaluate(order)
    assert requires is True
    assert "exceeds default threshold" in reason


@pytest.mark.asyncio
async def test_custom_threshold_branch():
    rule = SimpleNamespace(
        threshold_amount=Decimal("500.00"),
        restricted_categories=[],
    )
    engine = _engine_with_rule(rule)
    # Below custom threshold => auto-approve even though above default
    requires, _ = await engine.evaluate(_order("400.00", [_item(line_total="400.00")]))
    assert requires is False
    # At or above => approval needed
    requires, reason = await engine.evaluate(_order("500.00", [_item(line_total="500.00")]))
    assert requires is True
    assert "exceeds threshold" in reason


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
        "signals": [{"name": "Work Gloves"}],
    })
    requires, reason = await engine.evaluate(_order("50.00", [_item(line_total="50.00")]))
    assert requires is True
    assert "Quantity anomaly detected" in reason
