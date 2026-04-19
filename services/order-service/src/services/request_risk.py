from __future__ import annotations

import math
import statistics
from collections import defaultdict
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models import Order, OrderItem


def _mock_quantity_history(snapshot: dict | None) -> list[float]:
    snap = snapshot or {}
    category = (snap.get("category") or "").lower()
    unit = (snap.get("unit") or "").lower()
    name = (snap.get("name") or "").lower()

    if "ppe" in category or "glove" in name:
        return [12, 20, 24, 36, 48, 60]
    if "fastener" in category or "schraub" in name:
        return [100, 200, 250, 300, 400, 500]
    if "sealant" in category or "schaum" in name:
        return [6, 8, 10, 12, 16, 20]
    if unit in {"pc", "stk"}:
        return [10, 20, 30, 40, 50, 60]
    if unit in {"can", "tb"}:
        return [4, 8, 12, 16, 20]
    return [5, 10, 15, 20, 25]


def _logistic_risk(z_score: float) -> float:
    return 1.0 / (1.0 + math.exp(-(abs(z_score) - 1.5)))


async def compute_order_request_risk(
    db: AsyncSession,
    *,
    order: Order,
) -> dict:
    settings = get_settings()
    product_ids = [item.product_id for item in order.items]
    if not product_ids:
        return {"requires_review": False, "risk_score": 0.0, "signals": []}

    rows = await db.execute(
        select(OrderItem.product_id, OrderItem.quantity, OrderItem.product_snapshot)
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Order.company_id == order.company_id,
            Order.id != order.id,
            OrderItem.product_id.in_(product_ids),
        )
    )

    historical_by_product: dict[UUID, list[float]] = defaultdict(list)
    for product_id, quantity, _snapshot in rows.all():
        try:
            historical_by_product[product_id].append(float(quantity))
        except Exception:
            continue

    signals: list[dict] = []
    max_risk = 0.0

    for item in order.items:
        current_qty = float(item.quantity)
        snapshot = item.product_snapshot or {}
        history = historical_by_product.get(item.product_id, [])
        if len(history) < settings.ORDER_MIN_HISTORY_POINTS:
            history = history + _mock_quantity_history(snapshot)

        if len(history) < 2:
            continue

        mean = statistics.fmean(history)
        stddev = statistics.pstdev(history)
        if stddev == 0:
            # Guardrail for flat histories: use a small adaptive spread (10% of mean)
            # with an absolute floor of 1 unit to avoid divide-by-zero and overfitting.
            stddev = max(mean * 0.1, 1.0)

        z_score = (current_qty - mean) / stddev
        upper_bound = mean + settings.ORDER_STDDEV_MULTIPLIER * stddev
        risk_score = _logistic_risk(z_score)
        max_risk = max(max_risk, risk_score)

        is_anomaly = (
            current_qty > upper_bound
            or risk_score >= settings.ORDER_LOGISTIC_RISK_THRESHOLD
        )
        if is_anomaly:
            signals.append({
                "product_id": str(item.product_id),
                "name": snapshot.get("name"),
                "requested_quantity": current_qty,
                "historical_mean": round(mean, 3),
                "historical_stddev": round(stddev, 3),
                "upper_bound": round(upper_bound, 3),
                "z_score": round(z_score, 3),
                "risk_score": round(risk_score, 3),
            })

    return {
        "requires_review": len(signals) > 0,
        "risk_score": round(max_risk, 3),
        "signals": signals,
    }
