"""Seller comparison router.

Provides endpoints for:
- Comparing suppliers by product (price + scores)
- Getting supplier score breakdowns
- Triggering web scraping jobs
- Auto-approval recommendations
- Web search for supplier info
- Supplier proposals (search → score → propose → approve/reject)
- Preferred suppliers management
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from ..dependencies import require_internal_secret
from ..services.scoring import compare_suppliers, compute_supplier_score, get_supplier_score_breakdown
from ..services.scraper import run_scrape_job, scrape_supplier_page
from ..services.web_search import search_supplier_info, search_web
from ..services.supplier_proposal import (
    approve_proposal,
    create_supplier_proposal,
    get_proposal,
    list_preferred_suppliers,
    list_proposals,
    reject_proposal,
)

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


# ── Score computation ─────────────────────────────────────────────────
class ScoreResponse(BaseModel):
    supplier_id: str
    scores: dict[str, str]
    sample_size: int
    computed_at: str


@router.post(
    "/{supplier_id}/compute-score",
    response_model=ScoreResponse,
    dependencies=[Depends(require_internal_secret)],
)
async def compute_score(supplier_id: str):
    """Compute and store composite score for a supplier."""
    return await compute_supplier_score(supplier_id)


# ── Score breakdown ───────────────────────────────────────────────────
@router.get(
    "/{supplier_id}/score-breakdown",
    dependencies=[Depends(require_internal_secret)],
)
async def score_breakdown(supplier_id: str):
    """Get the full score breakdown for a supplier (all dimensions + weights)."""
    return await get_supplier_score_breakdown(supplier_id)


# ── Comparison ────────────────────────────────────────────────────────
class ComparisonResponse(BaseModel):
    product_id: str
    comparisons: list[dict]
    recommendation: str | None


@router.get(
    "/compare",
    response_model=ComparisonResponse,
    dependencies=[Depends(require_internal_secret)],
)
async def compare(
    product_id: str = Query(...),
    supplier_ids: str | None = Query(default=None, description="Comma-separated supplier UUIDs"),
):
    """Compare suppliers for a product based on price and composite score."""
    ids = supplier_ids.split(",") if supplier_ids else None
    return await compare_suppliers(product_id, ids)


# ── Auto-approval recommendation ─────────────────────────────────────
class ApprovalRecommendation(BaseModel):
    supplier_id: str
    approved: bool
    reason: str
    overall_score: str | None
    risk_level: str  # low, medium, high


@router.get(
    "/{supplier_id}/approval-recommendation",
    response_model=ApprovalRecommendation,
    dependencies=[Depends(require_internal_secret)],
)
async def approval_recommendation(supplier_id: str):
    """Get AI-powered recommendation on whether to auto-approve a supplier."""
    score_data = await compute_supplier_score(supplier_id)
    overall = float(score_data["scores"]["overall"])

    if overall >= 75:
        return ApprovalRecommendation(
            supplier_id=supplier_id,
            approved=True,
            reason=f"High overall score ({overall:.1f}/100). Supplier has strong track record.",
            overall_score=score_data["scores"]["overall"],
            risk_level="low",
        )
    elif overall >= 50:
        return ApprovalRecommendation(
            supplier_id=supplier_id,
            approved=False,
            reason=f"Medium score ({overall:.1f}/100). Manual review recommended.",
            overall_score=score_data["scores"]["overall"],
            risk_level="medium",
        )
    else:
        return ApprovalRecommendation(
            supplier_id=supplier_id,
            approved=False,
            reason=f"Low score ({overall:.1f}/100). Supplier has poor track record or insufficient data.",
            overall_score=score_data["scores"]["overall"],
            risk_level="high",
        )


# ── Web scraping ──────────────────────────────────────────────────────
class ScrapeRequest(BaseModel):
    urls: list[str]


class ScrapeResponse(BaseModel):
    job_id: str
    supplier_id: str
    status: str
    products_found: int
    errors: list[dict]


@router.post(
    "/{supplier_id}/scrape",
    response_model=ScrapeResponse,
    dependencies=[Depends(require_internal_secret)],
)
async def trigger_scrape(supplier_id: str, body: ScrapeRequest):
    """Trigger a web scraping job for a supplier's price lists."""
    return await run_scrape_job(supplier_id, body.urls)


class ScrapePreviewResponse(BaseModel):
    products: list[dict]
    count: int


@router.post(
    "/{supplier_id}/scrape-preview",
    response_model=ScrapePreviewResponse,
    dependencies=[Depends(require_internal_secret)],
)
async def scrape_preview(supplier_id: str, body: ScrapeRequest):
    """Preview what products can be scraped from URLs without storing."""
    all_products = []
    for url in body.urls:
        products = await scrape_supplier_page(url, supplier_id)
        all_products.extend(products)
    return ScrapePreviewResponse(products=all_products, count=len(all_products))


# ── Web search ────────────────────────────────────────────────────────
class WebSearchRequest(BaseModel):
    query: str
    num_results: int = 10


@router.post(
    "/web-search",
    dependencies=[Depends(require_internal_secret)],
)
async def web_search(body: WebSearchRequest):
    """Search the web for supplier information."""
    results = await search_web(body.query, body.num_results)
    return {"query": body.query, "results": results, "count": len(results)}


@router.get(
    "/{supplier_id}/web-info",
    dependencies=[Depends(require_internal_secret)],
)
async def get_supplier_web_info(supplier_id: str, name: str = Query(...)):
    """Search the web for a specific supplier's reputation and reviews."""
    return await search_supplier_info(name, supplier_id)


# ── Supplier proposals ────────────────────────────────────────────────
class ProposalRequest(BaseModel):
    company_id: str
    product_query: str
    category: str | None = None


@router.post(
    "/proposals",
    dependencies=[Depends(require_internal_secret)],
)
async def create_proposal(body: ProposalRequest):
    """Create a supplier proposal: web search → score → rank → propose."""
    return await create_supplier_proposal(
        body.company_id, body.product_query, body.category,
    )


@router.get(
    "/proposals/{proposal_id}",
    dependencies=[Depends(require_internal_secret)],
)
async def get_proposal_detail(proposal_id: str):
    """Get details of a specific proposal."""
    result = await get_proposal(proposal_id)
    if not result:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Proposal not found")
    return result


@router.get(
    "/proposals/by-company/{company_id}",
    dependencies=[Depends(require_internal_secret)],
)
async def list_company_proposals(
    company_id: str,
    status: str | None = Query(default=None),
):
    """List all proposals for a company."""
    return await list_proposals(company_id, status)


class ApproveProposalRequest(BaseModel):
    supplier_index: int
    approved_by: str
    notes: str | None = None


@router.post(
    "/proposals/{proposal_id}/approve",
    dependencies=[Depends(require_internal_secret)],
)
async def approve_proposal_endpoint(proposal_id: str, body: ApproveProposalRequest):
    """Approve a proposal and save chosen supplier to preferred_suppliers."""
    result = await approve_proposal(
        proposal_id, body.supplier_index, body.approved_by, body.notes,
    )
    if "error" in result:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=result["error"])
    return result


class RejectProposalRequest(BaseModel):
    rejected_by: str
    reason: str | None = None


@router.post(
    "/proposals/{proposal_id}/reject",
    dependencies=[Depends(require_internal_secret)],
)
async def reject_proposal_endpoint(proposal_id: str, body: RejectProposalRequest):
    """Reject a proposal."""
    result = await reject_proposal(proposal_id, body.rejected_by, body.reason)
    if "error" in result:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=result["error"])
    return result


# ── Preferred suppliers ───────────────────────────────────────────────
@router.get(
    "/preferred/{company_id}",
    dependencies=[Depends(require_internal_secret)],
)
async def get_preferred_suppliers(
    company_id: str,
    active_only: bool = Query(default=True),
):
    """List all preferred/approved suppliers for a company."""
    return await list_preferred_suppliers(company_id, active_only)
