"""Web search service for supplier research.

Searches the web for supplier reputation, reviews, and quality information.
Uses DuckDuckGo HTML search (no API key required) for open web search.
AI-based summarization is stubbed — will use ChatGPT in production.
"""
import logging
import re
import uuid
from datetime import datetime, timezone
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup

from ..config import settings

logger = logging.getLogger(__name__)

SEARCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "de-CH,de;q=0.9,en;q=0.8",
}


async def _db_pool():
    import asyncpg
    if not hasattr(_db_pool, "_pool"):
        _db_pool._pool = await asyncpg.create_pool(
            settings.DATABASE_URL.replace("+asyncpg", ""),
            min_size=2, max_size=5,
        )
    return _db_pool._pool


async def search_web(query: str, num_results: int = 10) -> list[dict]:
    """Search the web using DuckDuckGo HTML (no API key needed).

    Returns list of {title, url, snippet}.
    """
    encoded = quote_plus(query)
    url = f"https://html.duckduckgo.com/html/?q={encoded}"

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(url, headers=SEARCH_HEADERS)
            resp.raise_for_status()
    except Exception as e:
        logger.warning("Web search failed: %s", e)
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    results = []

    for result_div in soup.select(".result"):
        title_el = result_div.select_one(".result__title a")
        snippet_el = result_div.select_one(".result__snippet")
        if not title_el:
            continue
        href = title_el.get("href", "")
        # DuckDuckGo wraps URLs in redirect — extract actual URL
        if "uddg=" in href:
            match = re.search(r"uddg=([^&]+)", href)
            if match:
                from urllib.parse import unquote
                href = unquote(match.group(1))

        results.append({
            "title": title_el.get_text(strip=True),
            "url": href,
            "snippet": snippet_el.get_text(strip=True) if snippet_el else "",
        })
        if len(results) >= num_results:
            break

    return results


async def fetch_page_text(url: str, max_chars: int = 5000) -> str:
    """Fetch a web page and extract its text content."""
    try:
        async with httpx.AsyncClient(
            timeout=10.0, follow_redirects=True, headers=SEARCH_HEADERS,
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
    except Exception as e:
        logger.warning("Failed to fetch %s: %s", url, e)
        return ""

    soup = BeautifulSoup(resp.text, "html.parser")
    # Remove script/style
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    text = soup.get_text(separator=" ", strip=True)
    return text[:max_chars]


async def search_supplier_info(
    supplier_name: str,
    supplier_id: str | None = None,
) -> dict:
    """Search the web for supplier reputation and quality info.

    Returns structured results with search hits and extracted info.
    AI summarization is stubbed — will be done by ChatGPT in production.
    """
    queries = [
        f"{supplier_name} Bewertung Erfahrung Baustoff",
        f"{supplier_name} reviews construction materials Switzerland",
        f"{supplier_name} Lieferant Qualität Zuverlässigkeit",
    ]

    all_results = []
    for q in queries:
        results = await search_web(q, num_results=5)
        all_results.extend(results)

    # Deduplicate by URL
    seen_urls = set()
    unique_results = []
    for r in all_results:
        if r["url"] not in seen_urls:
            seen_urls.add(r["url"])
            unique_results.append(r)

    # Fetch top 3 pages for content extraction
    page_texts = []
    for r in unique_results[:3]:
        text = await fetch_page_text(r["url"])
        if text:
            page_texts.append({"url": r["url"], "title": r["title"], "text": text})

    # Extract basic signals from snippets (keyword-based, no AI)
    positive_keywords = [
        "zuverlässig", "reliable", "quality", "qualität", "pünktlich",
        "on-time", "recommended", "empfohlen", "gut", "good", "excellent",
        "schnell", "fast", "professionell", "professional",
    ]
    negative_keywords = [
        "schlecht", "bad", "poor", "verspätet", "delayed", "unreliable",
        "unzuverlässig", "complaint", "beschwerde", "problem", "mangelhaft",
    ]

    all_text = " ".join(r["snippet"].lower() for r in unique_results)
    all_text += " " + " ".join(p["text"].lower() for p in page_texts)

    positive_hits = sum(1 for kw in positive_keywords if kw in all_text)
    negative_hits = sum(1 for kw in negative_keywords if kw in all_text)

    # Simple reputation score (0-100) from keyword signals
    total_signals = positive_hits + negative_hits
    if total_signals > 0:
        reputation_score = round((positive_hits / total_signals) * 100)
    else:
        reputation_score = 50  # neutral if no signals

    result = {
        "supplier_name": supplier_name,
        "search_results_count": len(unique_results),
        "search_results": unique_results[:10],
        "pages_analyzed": len(page_texts),
        "reputation_score": reputation_score,
        "positive_signals": positive_hits,
        "negative_signals": negative_hits,
        # Stub: AI summary will be filled in by ChatGPT later
        "ai_summary": None,
        "ai_quality_assessment": None,
    }

    # Cache results in DB if supplier_id given
    if supplier_id:
        try:
            pool = await _db_pool()
            async with pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO procurement.web_search_cache
                        (id, supplier_id, query, results, searched_at)
                    VALUES ($1, $2, $3, $4::jsonb, $5)
                """,
                    uuid.uuid4(),
                    uuid.UUID(supplier_id),
                    supplier_name,
                    __import__("json").dumps(result),
                    datetime.now(timezone.utc),
                )
        except Exception as e:
            logger.warning("Failed to cache search results: %s", e)

    return result
