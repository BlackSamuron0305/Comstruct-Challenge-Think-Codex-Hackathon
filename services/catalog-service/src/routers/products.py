from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..dependencies import require_internal_secret
from ..models import Product
from ..schemas import (
    BulkUpsertRequest,
    BulkUpsertResponse,
    CategoryNode,
    ProductOut,
    SearchByVectorRequest,
)

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=list[ProductOut])
async def list_products(
    category: str | None = None,
    supplier_id: UUID | None = None,
    q: str | None = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_session),
):
    stmt = select(Product).where(Product.is_active.is_(True), Product.material_class == "C")
    if category:
        stmt = stmt.where(Product.category == category)
    if supplier_id:
        stmt = stmt.where(Product.supplier_id == supplier_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Product.name.ilike(like))
    stmt = stmt.order_by(Product.name).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/{product_id}", response_model=ProductOut)
async def get_product(product_id: UUID, db: AsyncSession = Depends(get_session)):
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    return product


@router.post("/search-by-vector", response_model=list[ProductOut])
async def search_by_vector(
    body: SearchByVectorRequest,
    db: AsyncSession = Depends(get_session),
    _: None = Depends(require_internal_secret),
):
    """Internal: cosine similarity search via pgvector. Called by AI service."""
    stmt = (
        select(Product)
        .where(Product.is_active.is_(True), Product.material_class == "C")
        .where(Product.embedding.is_not(None))
    )
    if body.category:
        stmt = stmt.where(Product.category == body.category)
    stmt = stmt.order_by(Product.embedding.cosine_distance(body.embedding)).limit(body.limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


# ── Internal bulk upsert (called by AI service after ingestion) ────────
internal_router = APIRouter(prefix="/internal/products", tags=["internal"])


@internal_router.post(
    "/bulk-upsert",
    response_model=BulkUpsertResponse,
    dependencies=[Depends(require_internal_secret)],
)
async def bulk_upsert(body: BulkUpsertRequest, db: AsyncSession = Depends(get_session)):
    upserted = 0
    skipped = 0
    errors: list[str] = []
    for p in body.products:
        if p.material_class != "C":
            skipped += 1
            continue
        try:
            existing = await db.execute(
                select(Product).where(
                    Product.supplier_id == p.supplier_id, Product.sku == p.sku
                )
            )
            row = existing.scalar_one_or_none()
            if row:
                row.name = p.name
                row.description = p.description
                row.category = p.category
                row.unit = p.unit
                row.packaging_qty = p.packaging_qty
                row.unit_price = p.unit_price
                row.currency = p.currency
                row.is_active = p.is_active
                if p.embedding is not None:
                    row.embedding = p.embedding
            else:
                row = Product(
                    supplier_id=p.supplier_id,
                    sku=p.sku,
                    internal_sku=f"INT-{p.sku}",
                    name=p.name,
                    description=p.description,
                    category=p.category,
                    material_class="C",
                    unit=p.unit,
                    packaging_qty=p.packaging_qty,
                    unit_price=p.unit_price,
                    currency=p.currency,
                    is_active=p.is_active,
                    embedding=p.embedding,
                )
                db.add(row)
            upserted += 1
        except Exception as e:  # noqa: BLE001
            errors.append(f"{p.sku}: {e}")
    await db.commit()
    return BulkUpsertResponse(upserted=upserted, skipped_a_class=skipped, errors=errors)


# ── Categories ────────────────────────────────────────────────────────
categories_router = APIRouter(prefix="/categories", tags=["categories"])


@categories_router.get("", response_model=list[CategoryNode])
async def list_categories(db: AsyncSession = Depends(get_session)):
    stmt = (
        select(Product.category, func.count(Product.id))
        .where(Product.is_active.is_(True), Product.material_class == "C",
               Product.category.is_not(None))
        .group_by(Product.category)
        .order_by(Product.category)
    )
    rows = (await db.execute(stmt)).all()
    return [CategoryNode(name=r[0], product_count=r[1]) for r in rows]
