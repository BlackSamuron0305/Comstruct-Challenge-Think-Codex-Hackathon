from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Supplier
from ..schemas import SupplierOut

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


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
