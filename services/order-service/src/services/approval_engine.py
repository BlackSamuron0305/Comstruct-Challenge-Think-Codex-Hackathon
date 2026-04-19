"""Approval engine — verbatim per spec §8 with project-snapshot integration."""
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models import ApprovalRule, Order, OrderStatus
from .request_risk import compute_order_request_risk


class ApprovalEngine:
    def __init__(self, db: AsyncSession):
        self.db = db
        self._defaults = get_settings()

    async def _get_rule(self, company_id) -> ApprovalRule | None:
        rows = await self.db.execute(
            select(ApprovalRule).where(ApprovalRule.company_id == company_id)
        )
        return rows.scalar_one_or_none()

    async def _request_risk(self, order: Order) -> dict:
        return await compute_order_request_risk(self.db, order=order)

    async def evaluate(self, order: Order) -> tuple[bool, str | None]:
        """Returns (requires_approval, reason)."""
        rule = await self._get_rule(order.company_id)

        # Defensive A-material check (should be filtered by AI gate, but belt-and-suspenders)
        for item in order.items:
            snap = item.product_snapshot or {}
            if snap.get("material_class") == "A":
                return True, "Contains A-materials — requires procurement review"

        if not rule:
            threshold = self._defaults.DEFAULT_APPROVAL_THRESHOLD
            if order.total_amount >= threshold:
                return True, (
                    f"Order total {order.total_amount} {order.currency} "
                    f"exceeds default threshold {threshold} CHF"
                )
            return False, None

        # Threshold
        if order.total_amount >= rule.threshold_amount:
            return True, (
                f"Order total {order.total_amount} {order.currency} "
                f"exceeds threshold {rule.threshold_amount} CHF"
            )

        # Restricted categories
        order_categories = {
            (item.product_snapshot or {}).get("category") for item in order.items
        } - {None}
        restricted = order_categories & set(rule.restricted_categories or [])
        if restricted:
            return True, f"Contains restricted categories: {', '.join(sorted(restricted))}"

        # Statistical request sanity-check against historical quantities.
        risk = await self._request_risk(order)
        if risk["requires_review"]:
            product_names = [s.get("name") for s in risk["signals"][:3] if s.get("name")]
            context = ", ".join(product_names) if product_names else "one or more items"
            return True, (
                f"Quantity anomaly detected for {context} "
                f"(risk {risk['risk_score']}, std-dev guard tripped)"
            )

        return False, None

    async def auto_approve(self, order: Order) -> Order:
        order.status = OrderStatus.APPROVED.value
        order.requires_approval = False
        return order

    async def request_approval(self, order: Order, reason: str) -> Order:
        order.status = OrderStatus.PENDING_APPROVAL.value
        order.requires_approval = True
        order.notes = (order.notes or "") + f"\n[approval] {reason}"
        return order


def total_for_items(items: list) -> Decimal:
    return sum((Decimal(str(i.line_total)) for i in items), Decimal("0"))
