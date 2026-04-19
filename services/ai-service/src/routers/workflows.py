"""Procurement workflow automation router.

AI-driven workflows:
- Auto-approval: evaluate orders against company policies + supplier scores
- Price analysis: compare current prices against historical data
- Reorder suggestion: predict when materials will run out
- Compliance check: verify orders against project budgets and regulations
"""
import logging
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..dependencies import require_internal_secret
from ..llm.ollama_client import call_ollama_json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["workflows"])


def _build_price_analysis_fallback(body) -> dict:
    history = [
        float(item.get("price"))
        for item in (body.historical_prices or [])
        if item.get("price") is not None
    ]
    if history:
        low = min(history)
        high = max(history)
        avg = sum(history) / len(history)
    else:
        low = body.current_price * 0.9
        high = body.current_price * 1.1
        avg = body.current_price

    if body.current_price > avg * 1.1:
        assessment = "high"
    elif body.current_price < avg * 0.9:
        assessment = "low"
    else:
        assessment = "fair"

    return {
        "assessment": assessment,
        "confidence": 0.65 if history else 0.4,
        "market_range": {"low": round(low, 2), "high": round(high, 2)},
        "recommendation": "Review alternative suppliers for this item." if assessment == "high" else "Current price is within the expected range.",
        "savings_potential": round(max(0.0, body.current_price - avg), 2),
    }


def _build_reorder_fallback(materials: list[dict]) -> dict:
    alerts: list[dict] = []
    for material in materials:
        stock = float(material.get("current_stock") or 0)
        daily = float(material.get("daily_usage") or 0)
        if daily <= 0:
            continue
        days_until_depleted = round(stock / daily, 1)
        if days_until_depleted <= 3:
            urgency = "immediate"
            suggested = max((daily * 7) - stock, daily)
        elif days_until_depleted <= 7:
            urgency = "soon"
            suggested = max((daily * 10) - stock, daily)
        elif days_until_depleted <= 14:
            urgency = "planned"
            suggested = max((daily * 14) - stock, daily)
        else:
            continue

        alerts.append({
            "name": material.get("name", "Unknown material"),
            "days_until_depleted": days_until_depleted,
            "reorder_urgency": urgency,
            "suggested_quantity": round(suggested, 2),
            "unit": material.get("unit") or "pc",
        })

    summary = (
        f"{len(alerts)} materials need reorder attention based on current stock burn-down."
        if alerts else
        "No urgent reorders detected from the provided stock data."
    )
    return {"alerts": alerts, "summary": summary}


# ── Auto-Approval ─────────────────────────────────────────────────
class ApprovalRequest(BaseModel):
    order_id: str
    items: list[dict]  # [{name, quantity, unit_price, currency, supplier_id}]
    total_amount: float
    currency: str = "CHF"
    company_id: str
    requester_role: str
    project_id: str | None = None
    supplier_scores: dict | None = None  # {supplier_id: {overall: float, ...}}
    approval_threshold: float = 200.0


class ApprovalDecision(BaseModel):
    order_id: str
    decision: str  # auto_approved, requires_review, rejected
    confidence: float
    reason: str
    risk_factors: list[str]
    recommended_approver: str | None = None


@router.post("/workflow/auto-approve", response_model=ApprovalDecision, dependencies=[Depends(require_internal_secret)])
async def auto_approve(body: ApprovalRequest):
    """AI-driven auto-approval for procurement orders."""
    # Rule-based pre-checks
    risk_factors = []
    if body.total_amount > body.approval_threshold * 5:
        risk_factors.append(f"High value order: {body.currency} {body.total_amount:.2f}")
    if body.supplier_scores:
        for sid, scores in body.supplier_scores.items():
            if float(scores.get("overall", 100)) < 50:
                risk_factors.append(f"Low-rated supplier: {sid}")

    # Quick auto-approve for small, routine orders
    if body.total_amount <= body.approval_threshold and not risk_factors:
        return ApprovalDecision(
            order_id=body.order_id,
            decision="auto_approved",
            confidence=0.95,
            reason=f"Below threshold ({body.currency} {body.approval_threshold:.2f}), no risk factors.",
            risk_factors=[],
        )

    # Use AI for complex decisions
    result = await call_ollama_json(
        system="""You are a procurement approval AI for Swiss construction companies.
Evaluate the order and decide: auto_approved, requires_review, or rejected.
Consider: total amount, supplier reliability, item types, company policies.

Return JSON: {"decision": "auto_approved|requires_review|rejected", "confidence": 0.0-1.0, "reason": "...", "risk_factors": ["..."], "recommended_approver": "project_manager|procurement_admin|null"}""",
        messages=[{"role": "user", "content": json.dumps({
            "order_id": body.order_id,
            "total_amount": body.total_amount,
            "currency": body.currency,
            "item_count": len(body.items),
            "items_summary": [{"name": i.get("name", ""), "unit_price": i.get("unit_price")} for i in body.items[:10]],
            "requester_role": body.requester_role,
            "supplier_scores": body.supplier_scores,
            "risk_factors": risk_factors,
            "threshold": body.approval_threshold,
        }, ensure_ascii=False)}],
        max_tokens=512,
        temperature=0.0,
        stub={
            "decision": "requires_review" if risk_factors else "auto_approved",
            "confidence": 0.7,
            "reason": (
                "Manual review recommended because risk flags were detected: " + "; ".join(risk_factors)
                if risk_factors else
                "Order is within routine approval limits based on the available policy inputs."
            ),
            "risk_factors": risk_factors,
            "recommended_approver": "project_manager" if risk_factors else None,
        },
    )

    return ApprovalDecision(
        order_id=body.order_id,
        decision=result.get("decision", "requires_review"),
        confidence=result.get("confidence", 0.5),
        reason=result.get("reason", ""),
        risk_factors=result.get("risk_factors", risk_factors),
        recommended_approver=result.get("recommended_approver"),
    )


# ── Price Analysis ────────────────────────────────────────────────
class PriceAnalysisRequest(BaseModel):
    product_name: str
    current_price: float
    currency: str = "CHF"
    historical_prices: list[dict] | None = None  # [{price, date, supplier}]
    supplier_id: str | None = None


@router.post("/workflow/price-analysis", dependencies=[Depends(require_internal_secret)])
async def price_analysis(body: PriceAnalysisRequest):
    """Analyze price fairness using historical data and AI."""
    result = await call_ollama_json(
        system="""You are a construction materials pricing analyst.
Analyze the current price against historical data and market knowledge.
Consider Swiss construction material market conditions.

Return JSON: {"assessment": "fair|high|low|suspicious", "confidence": 0.0-1.0, "market_range": {"low": ..., "high": ...}, "recommendation": "...", "savings_potential": ...}""",
        messages=[{"role": "user", "content": json.dumps({
            "product": body.product_name,
            "current_price": body.current_price,
            "currency": body.currency,
            "historical": body.historical_prices or [],
        }, ensure_ascii=False)}],
        max_tokens=512,
        temperature=0.1,
        stub=_build_price_analysis_fallback(body),
    )
    return result


# ── Reorder Suggestions ──────────────────────────────────────────
class ReorderCheckRequest(BaseModel):
    project_id: str
    materials: list[dict]  # [{name, current_stock, daily_usage, unit}]


@router.post("/workflow/reorder-check", dependencies=[Depends(require_internal_secret)])
async def reorder_check(body: ReorderCheckRequest):
    """Predict material depletion and suggest reorders."""
    result = await call_ollama_json(
        system="""You are a construction project logistics AI.
Given current stock levels and usage rates, identify materials that need reordering.
Account for typical delivery times in Switzerland (2-5 business days for standard materials).

Return JSON: {"alerts": [{"name": "...", "days_until_depleted": ..., "reorder_urgency": "immediate|soon|planned", "suggested_quantity": ..., "unit": "..."}], "summary": "..."}""",
        messages=[{"role": "user", "content": json.dumps({
            "project_id": body.project_id,
            "materials": body.materials,
        }, ensure_ascii=False)}],
        max_tokens=1024,
        temperature=0.1,
        stub=_build_reorder_fallback(body.materials),
    )
    return result


# ── Compliance Check ──────────────────────────────────────────────
class ComplianceCheckRequest(BaseModel):
    order_items: list[dict]
    project_id: str
    project_budget: float | None = None
    project_spent: float | None = None
    currency: str = "CHF"


@router.post("/workflow/compliance-check", dependencies=[Depends(require_internal_secret)])
async def compliance_check(body: ComplianceCheckRequest):
    """Check order against project budget and compliance rules."""
    order_total = sum(
        (i.get("unit_price", 0) or 0) * (i.get("quantity", 1) or 1)
        for i in body.order_items
    )

    issues = []
    if body.project_budget and body.project_spent is not None:
        remaining = body.project_budget - body.project_spent
        if order_total > remaining:
            issues.append(f"Order ({body.currency} {order_total:.2f}) exceeds remaining budget ({body.currency} {remaining:.2f})")

    result = await call_ollama_json(
        system="""You are a procurement compliance checker for Swiss construction.
Check the order against budget constraints and construction regulations.

Return JSON: {"compliant": true/false, "issues": ["..."], "warnings": ["..."], "recommendation": "approve|review|block"}""",
        messages=[{"role": "user", "content": json.dumps({
            "order_total": order_total,
            "currency": body.currency,
            "item_count": len(body.order_items),
            "project_budget": body.project_budget,
            "project_spent": body.project_spent,
            "pre_check_issues": issues,
        }, ensure_ascii=False)}],
        max_tokens=512,
        temperature=0.0,
        stub={
            "compliant": len(issues) == 0,
            "issues": issues,
            "warnings": [],
            "recommendation": "block" if issues else "approve",
        },
    )
    return result
