from __future__ import annotations

import math
import re
import statistics
import unicodedata
from collections import defaultdict
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models import Order, OrderItem


def _normalize_text(*values: object) -> str:
    text = " ".join(str(v or "") for v in values)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _derive_product_tag(snapshot: dict | None) -> str:
    snap = snapshot or {}
    explicit = snap.get("ai_tag") or snap.get("canonical_tag") or snap.get("product_family")
    if explicit:
        return _normalize_text(explicit).replace(" ", "-")

    text = _normalize_text(snap.get("name"), snap.get("category"), snap.get("description"))
    tag_keywords: list[tuple[str, tuple[str, ...]]] = [
        ("brushes", ("brush", "pinsel", "roller", "borste")),
        ("hammers", ("hammer", "mallet", "faustel")),
        ("gloves", ("glove", "handschuh", "nitril")),
        ("masks", ("mask", "atemschutz", "ffp")),
        ("screws", ("screw", "schraub", "bolt", "dubel", "anchor", "fastener")),
        ("sealants", ("sealant", "silikon", "foam", "schaum", "adhesive")),
        ("tapes", ("tape", "band", "gewebe")),
        ("drill-bits", ("drill", "bohrer", "sds")),
        ("batteries", ("battery", "batterie", "akku")),
        ("cleaners", ("cleaner", "reiniger", "solvent")),
    ]
    for tag, keywords in tag_keywords:
        if any(keyword in text for keyword in keywords):
            return tag

    category = _normalize_text(snap.get("category"))
    if category:
        return category.split()[-1]
    return "general-c-items"


def _mock_quantity_history(snapshot: dict | None) -> list[float]:
    snap = snapshot or {}
    category = (snap.get("category") or "").lower()
    unit = (snap.get("unit") or "").lower()
    demand_tag = _derive_product_tag(snap)

    demand_profiles: dict[str, list[float]] = {
        "brushes": [6, 8, 10, 12, 12, 14, 16, 18, 20, 24],
        "hammers": [1, 1, 2, 2, 2, 3, 3, 4],
        "gloves": [12, 20, 24, 36, 48, 60, 72, 84],
        "masks": [10, 12, 20, 20, 24, 30, 40],
        "screws": [120, 180, 220, 260, 300, 340, 390, 430, 500],
        "sealants": [4, 6, 8, 10, 12, 12, 16, 18, 20],
        "tapes": [2, 3, 4, 5, 6, 8, 10, 12],
        "drill-bits": [1, 2, 2, 3, 4, 4, 5, 6],
        "batteries": [4, 8, 8, 12, 12, 16, 20, 24],
        "cleaners": [1, 2, 3, 4, 4, 5, 6],
        "general-c-items": [5, 8, 10, 12, 15, 18, 20],
    }

    if demand_tag in demand_profiles:
        return demand_profiles[demand_tag]
    if "ppe" in category:
        return demand_profiles["gloves"]
    if unit in {"pc", "stk"}:
        return [8, 12, 16, 20, 24, 30, 36]
    if unit in {"can", "tb"}:
        return [4, 6, 8, 10, 12, 16]
    return demand_profiles["general-c-items"]


def _logistic_risk(z_score: float) -> float:
    return 1.0 / (1.0 + math.exp(-(abs(z_score) - 1.5)))


def _expected_quantity(history: list[float]) -> float:
    if not history:
        return 0.0
    long_term = statistics.fmean(history)
    recent_window = history[-min(4, len(history)):]
    recent_mean = statistics.fmean(recent_window)
    return (0.65 * recent_mean) + (0.35 * long_term)


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
        .where(Order.company_id == order.company_id, Order.id != order.id)
        .order_by(Order.created_at.asc())
    )

    historical_by_product: dict[UUID, list[float]] = defaultdict(list)
    historical_by_tag: dict[str, list[float]] = defaultdict(list)
    for product_id, quantity, snapshot in rows.all():
        try:
            qty = float(quantity)
        except Exception:
            continue
        historical_by_product[product_id].append(qty)
        historical_by_tag[_derive_product_tag(snapshot)].append(qty)

    signals: list[dict] = []
    max_risk = 0.0

    for item in order.items:
        current_qty = float(item.quantity)
        snapshot = item.product_snapshot or {}
        demand_tag = _derive_product_tag(snapshot)
        history = list(historical_by_product.get(item.product_id, []))

        if len(history) < settings.ORDER_MIN_HISTORY_POINTS:
            history.extend(historical_by_tag.get(demand_tag, []))
        if len(history) < settings.ORDER_MIN_HISTORY_POINTS:
            history.extend(_mock_quantity_history(snapshot))

        if len(history) < 2:
            continue

        mean = statistics.fmean(history)
        expected_qty = _expected_quantity(history)
        stddev = statistics.pstdev(history)
        if stddev == 0:
            stddev = max(expected_qty * 0.1, 1.0)

        z_score = (current_qty - expected_qty) / stddev
        upper_bound = expected_qty + settings.ORDER_STDDEV_MULTIPLIER * stddev
        risk_score = _logistic_risk(z_score)
        max_risk = max(max_risk, risk_score)

        is_anomaly = current_qty > upper_bound or risk_score >= settings.ORDER_LOGISTIC_RISK_THRESHOLD
        if is_anomaly:
            signals.append({
                "product_id": str(item.product_id),
                "name": snapshot.get("name"),
                "tag": demand_tag,
                "requested_quantity": current_qty,
                "expected_quantity": round(expected_qty, 3),
                "historical_mean": round(mean, 3),
                "historical_stddev": round(stddev, 3),
                "upper_bound": round(upper_bound, 3),
                "z_score": round(z_score, 3),
                "risk_score": round(risk_score, 3),
                "history_points": len(history),
            })

    return {
        "requires_review": len(signals) > 0,
        "risk_score": round(max_risk, 3),
        "signals": signals,
    }
