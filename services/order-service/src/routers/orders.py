from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..dependencies import CurrentUser, current_user, require_role
from ..models import Order, OrderItem, OrderStatus, Project, User, UserRole
from ..schemas import CheckoutRequest, OrderOut, RejectRequest
from ..services import (
    ApprovalEngine,
    IllegalTransition,
    assert_transition,
    cart_clear,
    cart_get,
    notify_event,
    publish_order_status,
    write_audit,
)

router = APIRouter(prefix="/orders", tags=["orders"])


async def _attach_foreman_names(db: AsyncSession, orders: Order | list[Order]) -> None:
    rows = orders if isinstance(orders, list) else [orders]
    foreman_ids = {row.foreman_id for row in rows if getattr(row, "foreman_id", None)}
    if not foreman_ids:
        return

    result = await db.execute(select(User.id, User.full_name).where(User.id.in_(foreman_ids)))
    name_by_id = {user_id: full_name for user_id, full_name in result.all()}
    for row in rows:
        setattr(row, "foreman_name", name_by_id.get(row.foreman_id))


# ── List / detail ─────────────────────────────────────────────────────
@router.get("", response_model=list[OrderOut])
async def list_orders(
    status: str | None = Query(default=None),
    project_id: UUID | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    stmt = select(Order).where(Order.company_id == user.company_id)
    if user.role == UserRole.CONSTRUCTION_WORKER.value:
        stmt = stmt.where(Order.foreman_id == user.id)
    if status:
        stmt = stmt.where(Order.status == status)
    if project_id:
        stmt = stmt.where(Order.project_id == project_id)
    stmt = stmt.order_by(Order.created_at.desc()).limit(limit).offset(offset)
    rows = await db.execute(stmt)
    orders = list(rows.scalars().unique().all())
    await _attach_foreman_names(db, orders)
    return orders


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: UUID,
    user: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    order = await db.get(Order, order_id)
    if not order or order.company_id != user.company_id:
        raise HTTPException(404, "Order not found")
    if user.role == UserRole.CONSTRUCTION_WORKER.value and order.foreman_id != user.id:
        raise HTTPException(403, "Forbidden")
    await _attach_foreman_names(db, order)
    return order


# ── Checkout from cart ────────────────────────────────────────────────
@router.post("/checkout", response_model=OrderOut, status_code=201)
async def checkout(
    body: CheckoutRequest,
    user: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    # Validate project belongs to user's company
    project = await db.get(Project, body.project_id)
    if not project or project.company_id != user.company_id:
        raise HTTPException(404, "Project not found")

    lines = await cart_get(user.id)
    if not lines:
        raise HTTPException(400, "Cart is empty")
    currency = lines[0]["currency"]
    if any(l["currency"] != currency for l in lines):
        raise HTTPException(400, "Cart contains mixed currencies — split into separate orders")

    order = Order(
        company_id=user.company_id,
        project_id=body.project_id,
        foreman_id=user.id,
        status=OrderStatus.DRAFT.value,
        currency=currency,
        requested_delivery=body.requested_delivery,
        notes=body.notes,
    )
    db.add(order)
    await db.flush()

    total = Decimal("0")
    for line in lines:
        qty = Decimal(str(line["quantity"]))
        unit_price = Decimal(line["unit_price"])
        line_total = qty * unit_price
        total += line_total
        db.add(OrderItem(
            order_id=order.id,
            product_id=UUID(line["product_id"]),
            product_snapshot=line,
            quantity=qty,
            unit=line["unit"],
            unit_price=unit_price,
            line_total=line_total,
        ))
    order.total_amount = total
    await db.flush()
    await db.refresh(order, attribute_names=["items"])

    # Approval evaluation
    engine = ApprovalEngine(db)
    requires, reason = await engine.evaluate(order)
    if requires:
        assert_transition(OrderStatus.DRAFT.value, OrderStatus.PENDING_APPROVAL.value)
        await engine.request_approval(order, reason or "Approval required")
        await write_audit(
            db, actor_id=user.id, actor_role=user.role, actor_ip=user.ip,
            action="order.submit_for_approval", entity_type="order",
            entity_id=order.id, payload={"reason": reason, "total": str(total)},
        )
        await notify_event("order_pending_approval", {
            "order_id": str(order.id),
            "company_id": str(order.company_id),
            "foreman_id": str(order.foreman_id),
            "total_amount": str(total),
            "currency": currency,
            "reason": reason,
        })
    else:
        assert_transition(OrderStatus.DRAFT.value, OrderStatus.APPROVED.value)
        await engine.auto_approve(order)
        # Auto-progress to ORDERED
        assert_transition(OrderStatus.APPROVED.value, OrderStatus.ORDERED.value)
        order.status = OrderStatus.ORDERED.value
        await write_audit(
            db, actor_id=user.id, actor_role=user.role, actor_ip=user.ip,
            action="order.auto_approved", entity_type="order",
            entity_id=order.id, payload={"total": str(total)},
        )

    await db.commit()
    await db.refresh(order, attribute_names=["items"])
    await publish_order_status(order.id, order.status,
                               datetime.now(timezone.utc).isoformat())
    await cart_clear(user.id)
    await _attach_foreman_names(db, order)
    return order


# ── Approve / reject (PM or procurement) ──────────────────────────────
@router.post("/{order_id}/approve", response_model=OrderOut)
async def approve_order(
    order_id: UUID,
    user: CurrentUser = Depends(require_role(
        UserRole.FOREMAN.value, UserRole.PROCUREMENT_WORKER.value
    )),
    db: AsyncSession = Depends(get_session),
):
    order = await db.get(Order, order_id)
    if not order or order.company_id != user.company_id:
        raise HTTPException(404, "Order not found")
    try:
        assert_transition(order.status, OrderStatus.APPROVED.value)
    except IllegalTransition as e:
        raise HTTPException(409, str(e)) from e

    order.status = OrderStatus.APPROVED.value
    order.approver_id = user.id
    await db.flush()
    # Auto-promote to ORDERED
    assert_transition(order.status, OrderStatus.ORDERED.value)
    order.status = OrderStatus.ORDERED.value
    await write_audit(
        db, actor_id=user.id, actor_role=user.role, actor_ip=user.ip,
        action="order.approved", entity_type="order", entity_id=order.id,
        payload={"approver_id": str(user.id)},
    )
    await db.commit()
    await db.refresh(order, attribute_names=["items"])
    await publish_order_status(order.id, order.status,
                               datetime.now(timezone.utc).isoformat())
    await notify_event("order_approved", {
        "order_id": str(order.id),
        "foreman_id": str(order.foreman_id),
    })
    await _attach_foreman_names(db, order)
    return order


@router.post("/{order_id}/reject", response_model=OrderOut)
async def reject_order(
    order_id: UUID,
    body: RejectRequest,
    user: CurrentUser = Depends(require_role(
        UserRole.FOREMAN.value, UserRole.PROCUREMENT_WORKER.value
    )),
    db: AsyncSession = Depends(get_session),
):
    order = await db.get(Order, order_id)
    if not order or order.company_id != user.company_id:
        raise HTTPException(404, "Order not found")
    try:
        assert_transition(order.status, OrderStatus.REJECTED.value)
    except IllegalTransition as e:
        raise HTTPException(409, str(e)) from e

    order.status = OrderStatus.REJECTED.value
    order.rejection_reason = body.reason
    order.approver_id = user.id
    await write_audit(
        db, actor_id=user.id, actor_role=user.role, actor_ip=user.ip,
        action="order.rejected", entity_type="order", entity_id=order.id,
        payload={"reason": body.reason},
    )
    await db.commit()
    await db.refresh(order, attribute_names=["items"])
    await publish_order_status(order.id, order.status,
                               datetime.now(timezone.utc).isoformat())
    await notify_event("order_rejected", {
        "order_id": str(order.id),
        "foreman_id": str(order.foreman_id),
        "reason": body.reason,
    })
    await _attach_foreman_names(db, order)
    return order


# ── Supplier-side transitions (in_transit, delivered) ─────────────────
@router.post("/{order_id}/mark-in-transit", response_model=OrderOut)
async def mark_in_transit(
    order_id: UUID,
    user: CurrentUser = Depends(require_role(
        UserRole.PROCUREMENT_WORKER.value
    )),
    db: AsyncSession = Depends(get_session),
):
    order = await db.get(Order, order_id)
    if not order or order.company_id != user.company_id:
        raise HTTPException(404, "Order not found")
    try:
        assert_transition(order.status, OrderStatus.IN_TRANSIT.value)
    except IllegalTransition as e:
        raise HTTPException(409, str(e)) from e
    order.status = OrderStatus.IN_TRANSIT.value
    await write_audit(
        db, actor_id=user.id, actor_role=user.role, actor_ip=user.ip,
        action="order.in_transit", entity_type="order", entity_id=order.id,
    )
    await db.commit()
    await db.refresh(order, attribute_names=["items"])
    await publish_order_status(order.id, order.status,
                               datetime.now(timezone.utc).isoformat())
    await _attach_foreman_names(db, order)
    return order


@router.post("/{order_id}/mark-delivered", response_model=OrderOut)
async def mark_delivered(
    order_id: UUID,
    user: CurrentUser = Depends(require_role(
        UserRole.CONSTRUCTION_WORKER.value, UserRole.FOREMAN.value, UserRole.PROCUREMENT_WORKER.value
    )),
    db: AsyncSession = Depends(get_session),
):
    order = await db.get(Order, order_id)
    if not order or order.company_id != user.company_id:
        raise HTTPException(404, "Order not found")
    try:
        assert_transition(order.status, OrderStatus.DELIVERED.value)
    except IllegalTransition as e:
        raise HTTPException(409, str(e)) from e
    order.status = OrderStatus.DELIVERED.value
    await write_audit(
        db, actor_id=user.id, actor_role=user.role, actor_ip=user.ip,
        action="order.delivered", entity_type="order", entity_id=order.id,
    )
    await db.commit()
    await db.refresh(order, attribute_names=["items"])
    await publish_order_status(order.id, order.status,
                               datetime.now(timezone.utc).isoformat())
    await notify_event("order_delivered", {
        "order_id": str(order.id),
        "foreman_id": str(order.foreman_id),
    })
    return order


@router.delete("/{order_id}", status_code=204)
async def delete_draft(
    order_id: UUID,
    user: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    order = await db.get(Order, order_id)
    if not order or order.company_id != user.company_id:
        raise HTTPException(404, "Order not found")
    if order.status != OrderStatus.DRAFT.value:
        raise HTTPException(409, "Only drafts can be deleted")
    await db.delete(order)
    await db.commit()
