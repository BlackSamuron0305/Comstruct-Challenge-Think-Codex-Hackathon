"""Supplier proposal service.

Orchestrates the full flow:
1. Web search for suppliers matching a product query
2. Score each supplier (web reputation + existing data)
3. Prepare a proposal message for the procurement_worker
4. On approval, save the chosen supplier to preferred_suppliers
"""
import json
import logging
import uuid
from datetime import datetime, timezone

from ..config import settings
from .scoring import compute_supplier_score
from .web_search import search_supplier_info, search_web

logger = logging.getLogger(__name__)


async def _db_pool():
    import asyncpg
    if not hasattr(_db_pool, "_pool"):
        _db_pool._pool = await asyncpg.create_pool(
            settings.DATABASE_URL.replace("+asyncpg", ""),
            min_size=2, max_size=5,
        )
    return _db_pool._pool


async def create_supplier_proposal(
    company_id: str,
    product_query: str,
    category: str | None = None,
) -> dict:
    """Search for suppliers, score them, and create a proposal.

    Returns a proposal with ranked suppliers for procurement_worker review.
    """
    # Step 1: Search the web for potential suppliers
    search_queries = [
        f"{product_query} Lieferant Schweiz Baumaterial",
        f"{product_query} supplier Switzerland construction",
    ]
    if category:
        search_queries.append(f"{category} {product_query} Anbieter")

    all_search_results = []
    for q in search_queries:
        results = await search_web(q, num_results=8)
        all_search_results.extend(results)

    # Deduplicate
    seen = set()
    unique_results = []
    for r in all_search_results:
        if r["url"] not in seen:
            seen.add(r["url"])
            unique_results.append(r)

    # Step 2: Extract potential supplier names from search results
    # (Simple heuristic: domain names and title patterns)
    potential_suppliers = []
    for r in unique_results[:10]:
        supplier_info = await search_supplier_info(
            r["title"].split(" - ")[0].split(" | ")[0].strip()[:60],
        )
        potential_suppliers.append({
            "name": r["title"].split(" - ")[0].split(" | ")[0].strip()[:60],
            "url": r["url"],
            "snippet": r["snippet"],
            "reputation_score": supplier_info["reputation_score"],
            "positive_signals": supplier_info["positive_signals"],
            "negative_signals": supplier_info["negative_signals"],
            "search_results_count": supplier_info["search_results_count"],
        })

    # Step 3: Rank suppliers by reputation score
    potential_suppliers.sort(key=lambda s: s["reputation_score"], reverse=True)

    # Step 4: Prepare the proposal message
    summary_lines = [
        f"## Supplier Proposal: {product_query}",
        f"**Category:** {category or 'General'}",
        f"**Found {len(potential_suppliers)} potential suppliers**\n",
    ]

    for i, s in enumerate(potential_suppliers[:5], 1):
        summary_lines.append(
            f"### {i}. {s['name']}\n"
            f"- **Reputation Score:** {s['reputation_score']}/100\n"
            f"- **Positive signals:** {s['positive_signals']}, "
            f"**Negative signals:** {s['negative_signals']}\n"
            f"- **Website:** {s['url']}\n"
            f"- *{s['snippet'][:200]}*\n"
        )

    if potential_suppliers:
        summary_lines.append(
            f"\n**Recommendation:** {potential_suppliers[0]['name']} "
            f"(score: {potential_suppliers[0]['reputation_score']}/100)"
        )

    web_search_summary = "\n".join(summary_lines)

    # Step 5: Save the proposal to DB
    proposal_id = uuid.uuid4()
    pool = await _db_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO procurement.supplier_proposals
                (id, company_id, product_query, status, proposed_suppliers,
                 scoring_details, web_search_summary, created_at)
            VALUES ($1, $2, $3, 'pending', $4::jsonb, $5::jsonb, $6, $7)
        """,
            proposal_id,
            uuid.UUID(company_id),
            product_query,
            json.dumps(potential_suppliers[:5]),
            json.dumps({"weights": {"reputation": 1.0}, "total_found": len(potential_suppliers)}),
            web_search_summary,
            datetime.now(timezone.utc),
        )

    return {
        "proposal_id": str(proposal_id),
        "status": "pending",
        "product_query": product_query,
        "category": category,
        "supplier_count": len(potential_suppliers[:5]),
        "recommended": potential_suppliers[0] if potential_suppliers else None,
        "all_suppliers": potential_suppliers[:5],
        "summary": web_search_summary,
    }


async def get_proposal(proposal_id: str) -> dict | None:
    """Get a proposal by ID."""
    pool = await _db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT * FROM procurement.supplier_proposals WHERE id = $1
        """, uuid.UUID(proposal_id))

    if not row:
        return None

    return {
        "proposal_id": str(row["id"]),
        "company_id": str(row["company_id"]),
        "product_query": row["product_query"],
        "status": row["status"],
        "proposed_suppliers": json.loads(row["proposed_suppliers"]) if row["proposed_suppliers"] else [],
        "scoring_details": json.loads(row["scoring_details"]) if row["scoring_details"] else {},
        "web_search_summary": row["web_search_summary"],
        "recommended_supplier_id": str(row["recommended_supplier_id"]) if row["recommended_supplier_id"] else None,
        "approved_supplier_id": str(row["approved_supplier_id"]) if row["approved_supplier_id"] else None,
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
    }


async def list_proposals(
    company_id: str,
    status: str | None = None,
) -> list[dict]:
    """List proposals for a company, optionally filtered by status."""
    pool = await _db_pool()
    async with pool.acquire() as conn:
        query = "SELECT * FROM procurement.supplier_proposals WHERE company_id = $1"
        params: list = [uuid.UUID(company_id)]
        if status:
            query += " AND status = $2"
            params.append(status)
        query += " ORDER BY created_at DESC"
        rows = await conn.fetch(query, *params)

    return [
        {
            "proposal_id": str(r["id"]),
            "product_query": r["product_query"],
            "status": r["status"],
            "supplier_count": len(json.loads(r["proposed_suppliers"])) if r["proposed_suppliers"] else 0,
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]


async def approve_proposal(
    proposal_id: str,
    supplier_index: int,
    approved_by: str,
    notes: str | None = None,
) -> dict:
    """Approve a proposal and save the chosen supplier to preferred_suppliers.

    supplier_index: 0-based index into the proposed_suppliers array.
    """
    pool = await _db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT * FROM procurement.supplier_proposals
            WHERE id = $1 AND status = 'pending'
        """, uuid.UUID(proposal_id))

        if not row:
            return {"error": "Proposal not found or already processed"}

        suppliers = json.loads(row["proposed_suppliers"]) if row["proposed_suppliers"] else []
        if supplier_index < 0 or supplier_index >= len(suppliers):
            return {"error": f"Invalid supplier index {supplier_index}, must be 0-{len(suppliers)-1}"}

        chosen = suppliers[supplier_index]
        supplier_id = uuid.uuid4()  # new supplier entry
        now = datetime.now(timezone.utc)

        # Save to preferred_suppliers
        await conn.execute("""
            INSERT INTO procurement.preferred_suppliers
                (id, company_id, supplier_id, supplier_name, category,
                 approved_by, approved_at, notes, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
            ON CONFLICT (company_id, supplier_id) DO UPDATE
                SET is_active = TRUE, approved_at = $7, notes = $8
        """,
            uuid.uuid4(),
            uuid.UUID(row["company_id"]),
            supplier_id,
            chosen["name"],
            row["product_query"],
            uuid.UUID(approved_by),
            now,
            notes,
        )

        # Update proposal status
        await conn.execute("""
            UPDATE procurement.supplier_proposals
            SET status = 'approved',
                approved_supplier_id = $2,
                approved_by = $3,
                approved_at = $4
            WHERE id = $1
        """,
            uuid.UUID(proposal_id),
            supplier_id,
            uuid.UUID(approved_by),
            now,
        )

    return {
        "proposal_id": proposal_id,
        "status": "approved",
        "chosen_supplier": chosen,
        "supplier_id": str(supplier_id),
        "approved_by": approved_by,
        "approved_at": now.isoformat(),
    }


async def reject_proposal(
    proposal_id: str,
    rejected_by: str,
    reason: str | None = None,
) -> dict:
    """Reject a proposal."""
    pool = await _db_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("""
            UPDATE procurement.supplier_proposals
            SET status = 'rejected',
                approved_by = $2,
                approved_at = $3
            WHERE id = $1 AND status = 'pending'
        """,
            uuid.UUID(proposal_id),
            uuid.UUID(rejected_by),
            datetime.now(timezone.utc),
        )

    if result == "UPDATE 0":
        return {"error": "Proposal not found or already processed"}

    return {"proposal_id": proposal_id, "status": "rejected"}


async def list_preferred_suppliers(
    company_id: str,
    active_only: bool = True,
) -> list[dict]:
    """List all preferred suppliers for a company."""
    pool = await _db_pool()
    async with pool.acquire() as conn:
        query = "SELECT * FROM procurement.preferred_suppliers WHERE company_id = $1"
        params: list = [uuid.UUID(company_id)]
        if active_only:
            query += " AND is_active = TRUE"
        query += " ORDER BY approved_at DESC"
        rows = await conn.fetch(query, *params)

    return [
        {
            "id": str(r["id"]),
            "supplier_id": str(r["supplier_id"]),
            "supplier_name": r["supplier_name"],
            "category": r["category"],
            "approved_by": str(r["approved_by"]) if r["approved_by"] else None,
            "approved_at": r["approved_at"].isoformat() if r["approved_at"] else None,
            "notes": r["notes"],
            "is_active": r["is_active"],
        }
        for r in rows
    ]
