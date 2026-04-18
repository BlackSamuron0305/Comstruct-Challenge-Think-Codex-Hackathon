"""Catalog client - fetch product info to snapshot into orders."""
import httpx

from ..config import get_settings


async def fetch_products(product_ids: list[str]) -> dict[str, dict]:
    """Returns {product_id: product_dict} for the given ids."""
    s = get_settings()
    out: dict[str, dict] = {}
    async with httpx.AsyncClient(timeout=5.0) as client:
        # Catalog has GET /products/{id}; do parallel fetches
        for pid in product_ids:
            r = await client.get(f"{s.CATALOG_SERVICE_URL}/products/{pid}")
            if r.status_code == 200:
                out[pid] = r.json()
    return out
