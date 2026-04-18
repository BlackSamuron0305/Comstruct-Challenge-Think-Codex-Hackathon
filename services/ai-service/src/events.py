"""Redis event bus for publishing real-time events to WebSocket clients.

Events are published to Redis channels that the api-gateway WebSocket bridge
subscribes to and forwards to connected clients.

Channels:
- ai.progress.<job_id>  — AI job progress (extraction, scoring, analysis)
- order.status.<order_id> — Order status changes
- price.alert.<company_id> — Price change alerts
"""
import json
import logging
from typing import Any

import redis.asyncio as aioredis

from .config import settings

logger = logging.getLogger(__name__)

_redis: aioredis.Redis | None = None


async def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


async def publish_event(channel: str, data: dict[str, Any]) -> None:
    """Publish an event to a Redis channel for WebSocket delivery."""
    try:
        r = await _get_redis()
        await r.publish(channel, json.dumps(data, default=str))
    except Exception as e:
        logger.warning("Failed to publish event to %s: %s", channel, e)


async def publish_ai_progress(job_id: str, *, status: str, progress: float, detail: str = "") -> None:
    """Publish AI job progress for real-time UI updates."""
    await publish_event(f"ai.progress.{job_id}", {
        "job_id": job_id,
        "status": status,  # started, processing, completed, error
        "progress": progress,  # 0.0 - 1.0
        "detail": detail,
    })


async def publish_order_status(order_id: str, *, status: str, company_id: str, **extra: Any) -> None:
    """Publish order status change."""
    await publish_event(f"order.status.{order_id}", {
        "order_id": order_id,
        "status": status,
        "company_id": company_id,
        **extra,
    })
    # Also broadcast to company-wide channel
    await publish_event("order.status", {
        "order_id": order_id,
        "status": status,
        "company_id": company_id,
    })


async def publish_price_alert(company_id: str, *, product_id: str, supplier_id: str,
                               old_price: float, new_price: float, currency: str = "CHF") -> None:
    """Publish price change alert."""
    await publish_event(f"price.alert.{company_id}", {
        "product_id": product_id,
        "supplier_id": supplier_id,
        "old_price": old_price,
        "new_price": new_price,
        "currency": currency,
        "change_pct": round((new_price - old_price) / old_price * 100, 1) if old_price else 0,
    })
