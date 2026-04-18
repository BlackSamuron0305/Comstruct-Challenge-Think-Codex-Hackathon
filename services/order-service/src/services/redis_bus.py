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


# Lua script: atomic read-modify-write for cart items.
# Avoids the race condition of separate HGET → HSET calls.
_CART_ADD_LUA = """
local key = KEYS[1]
local pid = ARGV[1]
local new_item_json = ARGV[2]
local add_qty = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

local existing = redis.call('HGET', key, pid)
if existing then
    local prev = cjson.decode(existing)
    prev['quantity'] = (tonumber(prev['quantity']) or 0) + add_qty
    local price = tonumber(prev['unit_price']) or 0
    prev['line_total'] = string.format('%.2f', price * prev['quantity'])
    redis.call('HSET', key, pid, cjson.encode(prev))
else
    local item = cjson.decode(new_item_json)
    local price = tonumber(item['unit_price']) or 0
    item['line_total'] = string.format('%.2f', price * tonumber(item['quantity']))
    redis.call('HSET', key, pid, cjson.encode(item))
end
redis.call('EXPIRE', key, ttl)
return 1
"""
_cart_add_script = None


async def cart_add(user_id: UUID, item: dict) -> None:
    global _cart_add_script
    r = get_redis()
    if _cart_add_script is None:
        _cart_add_script = r.register_script(_CART_ADD_LUA)

    pid = item["product_id"]
    item["line_total"] = str(
        Decimal(item["unit_price"]) * Decimal(str(item["quantity"]))
    )
    await _cart_add_script(
        keys=[_cart_key(user_id)],
        args=[pid, json.dumps(item, default=str), float(item["quantity"]), 60 * 60 * 24 * 7],
    )


async def cart_remove(user_id: UUID, product_id: UUID) -> None:
    r = get_redis()
    await r.hdel(_cart_key(user_id), str(product_id))


async def cart_clear(user_id: UUID) -> None:
    r = get_redis()
    await r.delete(_cart_key(user_id))
