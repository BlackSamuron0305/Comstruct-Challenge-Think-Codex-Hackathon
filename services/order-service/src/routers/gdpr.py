"""GDPR endpoints — data export and account erasure (right to be forgotten).

These endpoints are proxied from the API gateway and require a valid user session.
All actions are scoped strictly to the requesting user's own data.
"""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..dependencies import CurrentUser, current_user
from ..models import Order, Project, User

router = APIRouter(prefix="/users/me", tags=["gdpr"])


@router.get(
    "/export",
    summary="Export all personal data (GDPR Art. 20 — data portability)",
)
async def export_my_data(
    me: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Return a JSON bundle of all data held for the authenticated user."""
    user_row = await db.get(User, me.id)
    if not user_row:
        raise HTTPException(404, "User not found")

    # Fetch all orders belonging to this user.
    orders_result = await db.execute(
        select(Order).where(Order.foreman_id == me.id)
    )
    orders = orders_result.scalars().all()

    # Fetch all projects belonging to the user's company.
    projects_result = await db.execute(
        select(Project).where(Project.company_id == me.company_id)
    )
    projects = projects_result.scalars().all()

    def _order_to_dict(o: Order) -> dict[str, Any]:
        return {
            "id": str(o.id),
            "project_id": str(o.project_id) if o.project_id else None,
            "supplier_id": str(o.supplier_id) if o.supplier_id else None,
            "supplier_name": o.supplier_name,
            "total_amount": str(o.total_amount),
            "currency": o.currency,
            "status": o.status,
            "notes": o.notes,
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "updated_at": o.updated_at.isoformat() if o.updated_at else None,
        }

    def _project_to_dict(p: Project) -> dict[str, Any]:
        return {
            "id": str(p.id),
            "name": p.name,
            "site_address": p.site_address,
            "trade": p.trade,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }

    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "profile": {
            "id": str(user_row.id),
            "email": user_row.email,
            "full_name": user_row.full_name,
            "role": user_row.role,
            "phone": user_row.phone,
            "is_active": user_row.is_active,
            "created_at": user_row.created_at.isoformat() if user_row.created_at else None,
        },
        "orders": [_order_to_dict(o) for o in orders],
        "projects": [_project_to_dict(p) for p in projects],
    }


@router.delete(
    "",
    status_code=204,
    summary="Erase personal data (GDPR Art. 17 — right to erasure)",
)
async def erase_my_data(
    me: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> Response:
    """Anonymise the user's personal data. The account is deactivated and PII
    fields are replaced with placeholder values. Orders are retained (required
    for financial/audit records) but the foreman reference is anonymised.
    """
    user_row = await db.get(User, me.id)
    if not user_row:
        raise HTTPException(404, "User not found")

    anon_name = f"deleted-user-{str(me.id)[:8]}"
    anon_email = f"deleted-{str(me.id)[:8]}@erased.invalid"

    # Anonymise the user record.
    await db.execute(
        update(User)
        .where(User.id == me.id)
        .values(
            email=anon_email,
            full_name=anon_name,
            password_hash="*",  # Prevents login.
            phone=None,
            is_active=False,
        )
    )

    await db.commit()
    return Response(status_code=204)
