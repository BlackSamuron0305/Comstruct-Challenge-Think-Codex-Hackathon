"""Internal client for the catalog-service."""
import httpx

from ..config import settings


def _headers() -> dict[str, str]:
    return {"X-Internal-Secret": settings.INTERNAL_SHARED_SECRET}


async def bulk_upsert_products(supplier_id: str, products: list[dict]) -> dict:
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            f"{settings.CATALOG_SERVICE_URL}/internal/products/bulk-upsert",
            headers=_headers(),
            json={"supplier_id": supplier_id, "products": products},
        )
        r.raise_for_status()
        return r.json()


async def search_by_vector(vector: list[float], limit: int = 12) -> list[dict]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.post(
            f"{settings.CATALOG_SERVICE_URL}/products/search-by-vector",
            headers=_headers(),
            json={"vector": vector, "limit": limit},
        )
        r.raise_for_status()
        return r.json()
