"""Web scraper for supplier price lists.

Scrapes configured supplier websites and extracts product prices.
Runs as a scheduled job or on-demand via API.
"""
import logging
import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from ..config import settings

logger = logging.getLogger(__name__)

# Price extraction patterns for Swiss construction suppliers
PRICE_PATTERNS = [
    re.compile(r"CHF\s*([\d',.]+)", re.IGNORECASE),
    re.compile(r"([\d',.]+)\s*CHF", re.IGNORECASE),
    re.compile(r"EUR\s*([\d',.]+)", re.IGNORECASE),
    re.compile(r"([\d',.]+)\s*EUR", re.IGNORECASE),
    re.compile(r"(?:price|preis|prix)[:\s]*([\d',.]+)", re.IGNORECASE),
]


def _clean_price(raw: str) -> Decimal | None:
    """Normalize Swiss price format (1'234.50 or 1.234,50) to Decimal."""
    cleaned = raw.replace("'", "").replace(" ", "")
    # Handle European format: 1.234,50
    if "," in cleaned and "." in cleaned:
        if cleaned.index(",") > cleaned.index("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    try:
        val = Decimal(cleaned)
        if val <= 0 or val > 1_000_000:
            return None
        return val
    except InvalidOperation:
        return None


async def scrape_supplier_page(url: str, supplier_id: str) -> list[dict]:
    """Scrape a single supplier page for product prices."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Only HTTP(S) URLs are supported")

    async with httpx.AsyncClient(
        timeout=30.0,
        follow_redirects=True,
        headers={"User-Agent": "ComstructBot/1.0 (price-check)"},
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    products = []

    # Strategy 1: Look for structured product tables
    for table in soup.find_all("table"):
        headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
        price_col = None
        name_col = None
        for i, h in enumerate(headers):
            if any(kw in h for kw in ["preis", "price", "prix", "chf", "eur"]):
                price_col = i
            if any(kw in h for kw in ["produkt", "product", "artikel", "name", "bezeichnung"]):
                name_col = i

        if price_col is not None:
            for row in table.find_all("tr"):
                cells = row.find_all(["td", "th"])
                if len(cells) > price_col:
                    price_text = cells[price_col].get_text(strip=True)
                    price = _extract_price(price_text)
                    name = cells[name_col].get_text(strip=True) if name_col is not None and len(cells) > name_col else None
                    if price and name:
                        products.append({
                            "name": name,
                            "unit_price": str(price),
                            "currency": "CHF",
                            "source_url": url,
                        })

    # Strategy 2: Look for product cards/divs with price data
    for card in soup.find_all(class_=re.compile(r"product|artikel|item", re.I)):
        name_el = card.find(class_=re.compile(r"name|title|bezeichnung", re.I))
        price_el = card.find(class_=re.compile(r"price|preis|prix", re.I))
        if name_el and price_el:
            price = _extract_price(price_el.get_text(strip=True))
            if price:
                products.append({
                    "name": name_el.get_text(strip=True),
                    "unit_price": str(price),
                    "currency": "CHF",
                    "source_url": url,
                })

    logger.info("Scraped %d products from %s", len(products), url)
    return products


def _extract_price(text: str) -> Decimal | None:
    """Extract first price from text using known patterns."""
    for pattern in PRICE_PATTERNS:
        m = pattern.search(text)
        if m:
            return _clean_price(m.group(1))
    # Fallback: try the whole text as a number
    return _clean_price(text)


async def _db_pool():
    """Get asyncpg connection pool."""
    import asyncpg
    if not hasattr(_db_pool, "_pool"):
        _db_pool._pool = await asyncpg.create_pool(
            settings.DATABASE_URL.replace("+asyncpg", ""),
            min_size=2, max_size=5,
        )
    return _db_pool._pool


async def store_scraped_prices(
    supplier_id: str,
    product_id: str,
    prices: list[dict],
) -> dict:
    """Store scraped prices in procurement.price_history."""
    pool = await _db_pool()
    inserted = 0
    async with pool.acquire() as conn:
        for p in prices:
            price_val = Decimal(p["unit_price"])
            await conn.execute("""
                INSERT INTO procurement.price_history
                    (id, product_id, supplier_id, unit_price, currency, source, scraped_url, recorded_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """,
                uuid.uuid4(),
                uuid.UUID(product_id),
                uuid.UUID(supplier_id),
                price_val,
                p.get("currency", "CHF"),
                "scraper",
                p.get("source_url", ""),
                datetime.now(timezone.utc),
            )
            inserted += 1
    return {"inserted": inserted}


async def run_scrape_job(supplier_id: str, urls: list[str]) -> dict:
    """Run a full scrape job for a supplier across multiple URLs."""
    pool = await _db_pool()
    job_id = uuid.uuid4()

    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO procurement.scrape_jobs (id, supplier_id, status, started_at)
            VALUES ($1, $2, 'running', $3)
        """, job_id, uuid.UUID(supplier_id), datetime.now(timezone.utc))

    total_products = 0
    errors = []

    for url in urls:
        try:
            products = await scrape_supplier_page(url, supplier_id)
            total_products += len(products)
        except Exception as e:
            logger.error("Scrape error for %s: %s", url, e)
            errors.append({"url": url, "error": str(e)})

    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE procurement.scrape_jobs
            SET status = $1, products_updated = $2, errors = $3::jsonb, completed_at = $4
            WHERE id = $5
        """,
            "completed" if not errors else "partial",
            total_products,
            __import__("json").dumps(errors),
            datetime.now(timezone.utc),
            job_id,
        )

    return {
        "job_id": str(job_id),
        "supplier_id": supplier_id,
        "status": "completed" if not errors else "partial",
        "products_found": total_products,
        "errors": errors,
    }
