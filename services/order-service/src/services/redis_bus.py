"""Async Redis pub/sub event emitter + cart store."""
import json
from decimal import Decimal
from uuid import UUID

import redis.asyncio as redis

from ..config import get_settings

_settings = get_settings()
_pool: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _pool
    if _pool is None:
        _pool = redis.from_url(_settings.REDIS_URL, decode_responses=True)
    return _pool


async def publish_order_status(order_id: UUID, status: str, updated_at: str) -> None:
    r = get_redis()
    payload = json.dumps({
        "type": "status_update",
        "orderId": str(order_id),
        "status": status,
        "updatedAt": updated_at,
    })
    # Per-order channel (gateway subscribes to order.status.<id> on first WS subscribe).
    await r.publish(f"order.status.{order_id}", payload)
    # Broadcast channel (catch-all).
    await r.publish("order.status", payload)


# ── Cart (Redis hash-of-lines per user) ───────────────────────────────
def _cart_key(user_id: UUID) -> str:
    return f"cart:{user_id}"


async def cart_get(user_id: UUID) -> list[dict]:
    r = get_redis()
    raw = await r.hgetall(_cart_key(user_id))
    return [json.loads(v) for v in raw.values()]


async def cart_add(user_id: UUID, item: dict) -> None:
    r = get_redis()
    pid = item["product_id"]
    existing = await r.hget(_cart_key(user_id), pid)
    if existing:
        prev = json.loads(existing)
        prev["quantity"] = float(prev.get("quantity", 0)) + float(item.get("quantity", 1))
        prev["line_total"] = str(
            Decimal(prev["unit_price"]) * Decimal(str(prev["quantity"]))
        )
        await r.hset(_cart_key(user_id), pid, json.dumps(prev, default=str))
    else:
        item["line_total"] = str(
            Decimal(item["unit_price"]) * Decimal(str(item["quantity"]))
        )
        await r.hset(_cart_key(user_id), pid, json.dumps(item, default=str))
    await r.expire(_cart_key(user_id), 60 * 60 * 24 * 7)  # 7 days


async def cart_remove(user_id: UUID, product_id: UUID) -> None:
    r = get_redis()
    await r.hdel(_cart_key(user_id), str(product_id))


async def cart_clear(user_id: UUID) -> None:
    r = get_redis()
    await r.delete(_cart_key(user_id))
