"""Seller comparison router.

Provides endpoints for:
- Comparing suppliers by product (price + scores)
- Getting supplier score breakdowns
- Triggering web scraping jobs
- Auto-approval recommendations
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from ..dependencies import require_internal_secret
from ..services.scoring import compare_suppliers, compute_supplier_score
from ..services.scraper import run_scrape_job, scrape_supplier_page

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
