from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..dependencies import CurrentUser, current_user, require_role
from ..models import ApprovalRule, UserRole
from ..schemas import ApprovalRuleOut, ApprovalRuleUpsert

router = APIRouter(prefix="/approvals", tags=["approvals"])


@router.get("/rule", response_model=ApprovalRuleOut | None)
async def get_rule(
    user: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    rows = await db.execute(
        select(ApprovalRule).where(ApprovalRule.company_id == user.company_id)
    )
    return rows.scalar_one_or_none()


@router.put("/rule", response_model=ApprovalRuleOut)
async def upsert_rule(
    body: ApprovalRuleUpsert,
    user: CurrentUser = Depends(require_role(UserRole.PROCUREMENT_ADMIN.value)),
    db: AsyncSession = Depends(get_session),
):
    rows = await db.execute(
        select(ApprovalRule).where(ApprovalRule.company_id == user.company_id)
    )
    rule = rows.scalar_one_or_none()
    if rule:
        rule.threshold_amount = body.threshold_amount
        rule.auto_approve_below = body.auto_approve_below
        rule.restricted_categories = body.restricted_categories
        rule.approver_role = body.approver_role
    else:
        rule = ApprovalRule(
            company_id=user.company_id,
            threshold_amount=body.threshold_amount,
            auto_approve_below=body.auto_approve_below,
            restricted_categories=body.restricted_categories,
            approver_role=body.approver_role,
        )
        db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule
