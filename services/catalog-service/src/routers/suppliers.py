from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Supplier
from ..schemas import SupplierCreate, SupplierOut

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


@router.post("", response_model=SupplierOut)
async def create_supplier(body: SupplierCreate, db: AsyncSession = Depends(get_session)):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Supplier name is required")

    existing = await db.execute(
        select(Supplier).where(func.lower(Supplier.name) == name.lower())
    )
    supplier = existing.scalar_one_or_none()

    if supplier is None:
        supplier = Supplier(
            name=name,
            email=body.email,
            phone=body.phone,
            contact_name=body.contact_name,
            avatar_url=body.avatar_url,
            is_active=True,
        )
        db.add(supplier)
    else:
        supplier.email = body.email or supplier.email
        supplier.phone = body.phone or supplier.phone
        supplier.contact_name = body.contact_name or supplier.contact_name
        supplier.avatar_url = body.avatar_url or supplier.avatar_url
        supplier.is_active = True

    await db.commit()
    await db.refresh(supplier)
    return supplier


@router.get("", response_model=list[SupplierOut])
async def list_suppliers(db: AsyncSession = Depends(get_session)):
    rows = await db.execute(
        select(Supplier).where(Supplier.is_active.is_(True)).order_by(Supplier.name)
    )
    return list(rows.scalars().all())


@router.get("/{supplier_id}", response_model=SupplierOut)
async def get_supplier(supplier_id: UUID, db: AsyncSession = Depends(get_session)):
    s = await db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Supplier not found")
    return s
