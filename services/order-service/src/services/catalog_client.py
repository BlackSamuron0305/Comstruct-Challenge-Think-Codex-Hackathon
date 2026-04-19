"""Catalog client - fetch product info and ranked alternatives from the catalog service."""
import httpx

from ..config import get_settings


async def fetch_products(product_ids: list[str]) -> dict[str, dict]:
    """Returns {product_id: product_dict} for the given ids."""
    s = get_settings()
    out: dict[str, dict] = {}
    async with httpx.AsyncClient(timeout=5.0) as client:
        for pid in product_ids:
            r = await client.get(f"{s.CATALOG_SERVICE_URL}/products/{pid}")
            if r.status_code == 200:
                out[pid] = r.json()
    return out


async def fetch_product_recommendations(
    *,
    product_id: str | None = None,
    query: str | None = None,
    requested_quantity: float | int | str = 1,
    strategy: str = "balanced",
) -> dict:
    s = get_settings()
    params = {
        "requested_quantity": requested_quantity,
        "strategy": strategy,
    }
    if product_id:
        params["product_id"] = product_id
    if query:
        params["query"] = query

    async with httpx.AsyncClient(timeout=8.0) as client:
        r = await client.get(f"{s.CATALOG_SERVICE_URL}/products/recommendations", params=params)
        if r.status_code == 200:
            return r.json()
    return {"top_choices": [], "others": [], "weights": {"price": "0.60", "delivery": "0.40"}}
