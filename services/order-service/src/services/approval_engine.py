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
        """Returns (requires_approval, reason).

        Statistical demand behaviour is the primary decision-maker for C-materials.
        Static rules remain only as safety guardrails for clearly restricted categories.
        """
        rule = await self._get_rule(order.company_id)

        # Defensive A-material check (should be filtered by AI gate, but belt-and-suspenders)
        for item in order.items:
            snap = item.product_snapshot or {}
            if snap.get("material_class") == "A":
                return True, "Contains A-materials — requires procurement review"

        # Statistical request sanity-check against historical quantities and AI-like product tags.
        risk = await self._request_risk(order)
        if risk["requires_review"]:
            lead_signal = (risk.get("signals") or [{}])[0]
            context = lead_signal.get("name") or lead_signal.get("tag") or "one or more items"
            expected = lead_signal.get("expected_quantity")
            stddev = lead_signal.get("historical_stddev")
            details: list[str] = []
            if expected is not None:
                details.append(f"expected {expected}")
            if stddev is not None:
                details.append(f"σ {stddev}")
            details.append(f"risk {risk['risk_score']}")
            return True, f"Quantity anomaly detected for {context} ({', '.join(details)})"

        # Restricted groups still force a manual review as a safety override.
        # A rule may name either a broad category ("Tools") or a fine taxonomy code
        # ("tools.hand.hammers.sledge"). Both must work.
        if rule:
            restricted_lookup = {
                str(value).strip().lower(): str(value).strip()
                for value in (rule.restricted_categories or [])
                if str(value).strip()
            }
            restricted_tokens = set(restricted_lookup)
            order_groups: set[str] = set()
            for item in order.items:
                snap = item.product_snapshot or {}
                for value in (snap.get("taxonomy_code"), snap.get("taxonomy_label"), snap.get("category")):
                    normalized = str(value or "").strip().lower()
                    if normalized:
                        order_groups.add(normalized)

            restricted = order_groups & restricted_tokens
            if restricted:
                labels = [restricted_lookup.get(value, value) for value in sorted(restricted)]
                return True, f"Contains restricted categories/groups: {', '.join(labels)}"

        # Fixed monetary thresholds are now advisory only; statistically normal C-item
        # orders can pass automatically even when the CHF total is high.
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
