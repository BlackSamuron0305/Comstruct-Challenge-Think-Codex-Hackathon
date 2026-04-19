from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import bindparam, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import get_session
from ..dependencies import require_internal_secret
from ..models import Product
from ..recommendations import build_product_recommendations
from ..taxonomy import infer_taxonomy_fields
from ..schemas import (
    BulkUpsertRequest,
    BulkUpsertResponse,
    CategoryNode,
    ProductOut,
    ProductRecommendationsResponse,
    SearchByVectorRequest,
)

router = APIRouter(prefix="/products", tags=["products"])


def _to_decimal(value: object | None) -> Decimal | None:
    if value is None or value == "":
        return None
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception:  # noqa: BLE001
        return None


async def _apply_delivery_history(rows: list[Product], db: AsyncSession) -> None:
    if not rows:
        return

    product_ids = [row.id for row in rows]
    supplier_ids = list({row.supplier_id for row in rows})

    product_stmt = text("""
        SELECT
            oi.product_id::text AS product_id,
            ROUND(AVG(EXTRACT(EPOCH FROM (o.updated_at - o.created_at)) / 86400.0)::numeric, 2) AS avg_days,
            COUNT(*) AS sample_size
        FROM orders.order_items oi
        JOIN orders.orders o ON o.id = oi.order_id
        WHERE o.status = 'delivered'
          AND oi.product_id IN :product_ids
        GROUP BY oi.product_id
    """).bindparams(bindparam("product_ids", expanding=True))

    supplier_stmt = text("""
        SELECT
            p.supplier_id::text AS supplier_id,
            ROUND(AVG(EXTRACT(EPOCH FROM (o.updated_at - o.created_at)) / 86400.0)::numeric, 2) AS avg_days,
            COUNT(*) AS sample_size
        FROM catalog.products p
        JOIN orders.order_items oi ON oi.product_id = p.id
        JOIN orders.orders o ON o.id = oi.order_id
        WHERE o.status = 'delivered'
          AND p.supplier_id IN :supplier_ids
        GROUP BY p.supplier_id
    """).bindparams(bindparam("supplier_ids", expanding=True))

    product_history = {
        row.product_id: (_to_decimal(row.avg_days), int(row.sample_size or 0))
        for row in (await db.execute(product_stmt, {"product_ids": product_ids})).all()
    }
    supplier_history = {
        row.supplier_id: (_to_decimal(row.avg_days), int(row.sample_size or 0))
        for row in (await db.execute(supplier_stmt, {"supplier_ids": supplier_ids})).all()
    }

    changed = False
    changed_rows: list[Product] = []
    for row in rows:
        avg_days, sample_size = product_history.get(str(row.id), (None, 0))
        if avg_days is None:
            avg_days, sample_size = supplier_history.get(str(row.supplier_id), (None, 0))

        if avg_days is None:
            avg_days = _to_decimal(row.source_delivery_days)
            sample_size = sample_size or 0

        confidence = None
        if avg_days is not None:
            confidence = Decimal(str(min(1, sample_size / 5 if sample_size else 0.2))).quantize(Decimal("0.01"))

        row_changed = False
        if row.expected_delivery_days != avg_days:
            row.expected_delivery_days = avg_days
            changed = True
            row_changed = True
        if row.delivery_confidence != confidence:
            row.delivery_confidence = confidence
            changed = True
            row_changed = True
        if row_changed:
            changed_rows.append(row)

    if changed:
        await db.commit()
        for row in changed_rows:
            await db.refresh(row)


def _strategy_weights(strategy: str) -> dict[str, Decimal]:
    normalized = (strategy or "balanced").lower().strip()
    if normalized == "cheapest":
        return {"price": Decimal("0.80"), "delivery": Decimal("0.20")}
    if normalized == "fastest":
        return {"price": Decimal("0.30"), "delivery": Decimal("0.70")}
    return {"price": Decimal("0.60"), "delivery": Decimal("0.40")}


@router.get("", response_model=list[ProductOut])
async def list_products(
    category: str | None = None,
    supplier_id: UUID | None = None,
    q: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    page_size: int | None = Query(default=None, ge=1, le=500),
    offset: int = 0,
    db: AsyncSession = Depends(get_session),
):
    stmt = (
        select(Product)
        .options(selectinload(Product.supplier))
        .where(Product.is_active.is_(True), Product.material_class == "C")
    )
    if category:
        stmt = stmt.where(Product.category == category)
    if supplier_id:
        stmt = stmt.where(Product.supplier_id == supplier_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(
            Product.name.ilike(like),
            Product.sku.ilike(like),
            Product.description.ilike(like),
            Product.category.ilike(like),
            Product.taxonomy_code.ilike(like),
            Product.taxonomy_label.ilike(like),
            Product.manufacturer.ilike(like),
            Product.manufacturer_sku.ilike(like),
            Product.ean.ilike(like),
        ))
    resolved_limit = page_size or limit
    stmt = stmt.order_by(Product.name).limit(resolved_limit).offset(offset)
    result = await db.execute(stmt)
    rows = list(result.scalars().unique().all())
    await _apply_delivery_history(rows, db)
    return rows


@router.get("/recommendations", response_model=ProductRecommendationsResponse)
async def recommend_products(
    query: str | None = Query(default=None),
    product_id: UUID | None = Query(default=None),
    requested_quantity: Decimal = Query(default=Decimal("1"), gt=0),
    strategy: str = Query(default="balanced"),
    db: AsyncSession = Depends(get_session),
):
    if query is None and product_id is None:
        raise HTTPException(400, "Provide query or product_id")

    base_product: Product | None = None
    if product_id is not None:
        base_stmt = select(Product).options(selectinload(Product.supplier)).where(Product.id == product_id)
        base_product = (await db.execute(base_stmt)).scalar_one_or_none()
        if base_product is None:
            raise HTTPException(404, "Product not found")
        query = query or base_product.name

    stmt = (
        select(Product)
        .options(selectinload(Product.supplier))
        .where(Product.is_active.is_(True), Product.material_class == "C")
    )

    if base_product is not None:
        if base_product.taxonomy_code:
            stmt = stmt.where(or_(Product.taxonomy_code == base_product.taxonomy_code, Product.id == base_product.id))
        elif base_product.category:
            stmt = stmt.where(or_(Product.category == base_product.category, Product.id == base_product.id))

    if query:
        like = f"%{query}%"
        tokens = [token.strip() for token in query.split() if token.strip()]
        token_filters = [
            or_(
                Product.name.ilike(f"%{token}%"),
                Product.description.ilike(f"%{token}%"),
                Product.sku.ilike(f"%{token}%"),
                Product.taxonomy_label.ilike(f"%{token}%"),
            )
            for token in tokens[:6]
        ]
        stmt = stmt.where(or_(
            Product.name.ilike(like),
            Product.description.ilike(like),
            Product.category.ilike(like),
            Product.taxonomy_label.ilike(like),
            *token_filters,
        ))

    rows = list((await db.execute(stmt.order_by(Product.name).limit(80))).scalars().unique().all())
    await _apply_delivery_history(rows, db)

    weights = _strategy_weights(strategy)
    ranked = build_product_recommendations(
        [
            {
                "id": row.id,
                "supplier_id": row.supplier_id,
                "supplier_name": row.supplier_name,
                "sku": row.sku,
                "internal_sku": row.internal_sku,
                "name": row.name,
                "description": row.description,
                "category": row.category,
                "manufacturer": row.manufacturer,
                "manufacturer_sku": row.manufacturer_sku,
                "ean": row.ean,
                "image_url": row.image_url,
                "special_info": row.special_info,
                "taxonomy_code": row.taxonomy_code,
                "taxonomy_label": row.taxonomy_label,
                "material_class": row.material_class,
                "unit": row.unit,
                "packaging_qty": row.packaging_qty,
                "unit_price": row.unit_price,
                "currency": row.currency,
                "source_delivery_days": row.source_delivery_days,
                "expected_delivery_days": row.expected_delivery_days,
                "delivery_confidence": row.delivery_confidence,
                "must_order": row.must_order,
                "base_discount_pct": row.base_discount_pct,
                "bulk_discount_pct": row.bulk_discount_pct,
                "bulk_discount_threshold": row.bulk_discount_threshold,
                "is_active": row.is_active,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            }
            for row in rows
        ],
        requested_quantity=requested_quantity,
        price_weight=weights["price"],
        delivery_weight=weights["delivery"],
    )

    top_choices: list[dict] = []
    seen_ids: set[str] = set()
    seen_buckets: set[str] = set()
    for item in ranked:
        bucket = str(item.get("recommendation_bucket") or "alternative")
        item_id = str(item.get("id"))
        if bucket in {"best_score", "cheapest", "fastest"} and item_id not in seen_ids and bucket not in seen_buckets:
            top_choices.append(item)
            seen_ids.add(item_id)
            seen_buckets.add(bucket)
    for item in ranked:
        item_id = str(item.get("id"))
        if len(top_choices) >= 3:
            break
        if item_id not in seen_ids:
            top_choices.append(item)
            seen_ids.add(item_id)

    others = [item for item in ranked if str(item.get("id")) not in seen_ids]

    return ProductRecommendationsResponse(
        query=query,
        product_id=product_id,
        requested_quantity=requested_quantity,
        weights=weights,
        top_choices=top_choices,
        others=others,
    )


@router.get("/{product_id}", response_model=ProductOut)
async def get_product(product_id: UUID, db: AsyncSession = Depends(get_session)):
    stmt = select(Product).options(selectinload(Product.supplier)).where(Product.id == product_id)
    product = (await db.execute(stmt)).scalar_one_or_none()
    if not product:
        raise HTTPException(404, "Product not found")
    await _apply_delivery_history([product], db)
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
        .options(selectinload(Product.supplier))
        .where(Product.is_active.is_(True), Product.material_class == "C")
        .where(Product.embedding.is_not(None))
    )
    if body.category:
        stmt = stmt.where(Product.category == body.category)
    stmt = stmt.order_by(Product.embedding.cosine_distance(body.embedding)).limit(body.limit)
    result = await db.execute(stmt)
    rows = list(result.scalars().unique().all())
    await _apply_delivery_history(rows, db)
    return rows


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
            taxonomy = infer_taxonomy_fields(p.model_dump())
            existing = await db.execute(
                select(Product).where(
                    Product.supplier_id == p.supplier_id, Product.sku == p.sku
                )
            )
            row = existing.scalar_one_or_none()
            if row:
                row.name = p.name
                row.description = p.description
                row.category = p.category or taxonomy["category"]
                row.manufacturer = p.manufacturer
                row.manufacturer_sku = p.manufacturer_sku
                row.ean = p.ean
                row.image_url = p.image_url
                row.special_info = p.special_info
                row.taxonomy_code = p.taxonomy_code or taxonomy["taxonomy_code"]
                row.taxonomy_label = p.taxonomy_label or taxonomy["taxonomy_label"]
                row.unit = p.unit
                row.packaging_qty = p.packaging_qty
                row.unit_price = p.unit_price
                row.currency = p.currency
                row.source_delivery_days = p.source_delivery_days
                row.expected_delivery_days = p.expected_delivery_days or row.expected_delivery_days
                row.must_order = p.must_order
                row.base_discount_pct = p.base_discount_pct
                row.bulk_discount_pct = p.bulk_discount_pct
                row.bulk_discount_threshold = p.bulk_discount_threshold
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
                    category=p.category or taxonomy["category"],
                    manufacturer=p.manufacturer,
                    manufacturer_sku=p.manufacturer_sku,
                    ean=p.ean,
                    image_url=p.image_url,
                    special_info=p.special_info,
                    taxonomy_code=p.taxonomy_code or taxonomy["taxonomy_code"],
                    taxonomy_label=p.taxonomy_label or taxonomy["taxonomy_label"],
                    material_class="C",
                    unit=p.unit,
                    packaging_qty=p.packaging_qty,
                    unit_price=p.unit_price,
                    currency=p.currency,
                    source_delivery_days=p.source_delivery_days,
                    expected_delivery_days=p.expected_delivery_days,
                    must_order=p.must_order,
                    base_discount_pct=p.base_discount_pct,
                    bulk_discount_pct=p.bulk_discount_pct,
                    bulk_discount_threshold=p.bulk_discount_threshold,
                    is_active=p.is_active,
                    embedding=p.embedding,
                )
                db.add(row)
            upserted += 1
        except Exception as e:  # noqa: BLE001
            errors.append(f"{p.sku}: {e}")
    await db.commit()
    return BulkUpsertResponse(upserted=upserted, skipped_a_class=skipped, errors=errors)


@internal_router.post(
    "/backfill-taxonomy",
    dependencies=[Depends(require_internal_secret)],
)
async def backfill_taxonomy(db: AsyncSession = Depends(get_session)):
    stmt = select(Product).where(Product.material_class == "C", Product.is_active.is_(True))
    rows = list((await db.execute(stmt)).scalars().all())
    updated = 0
    for row in rows:
        inferred = infer_taxonomy_fields({
            "name": row.name,
            "description": row.description,
            "category": row.category,
            "taxonomy_code": row.taxonomy_code,
            "taxonomy_label": row.taxonomy_label,
        })
        changed = False
        if row.category != inferred["category"] and not row.category:
            row.category = inferred["category"]
            changed = True
        if row.taxonomy_code != inferred["taxonomy_code"]:
            row.taxonomy_code = inferred["taxonomy_code"]
            changed = True
        if row.taxonomy_label != inferred["taxonomy_label"]:
            row.taxonomy_label = inferred["taxonomy_label"]
            changed = True
        if changed:
            updated += 1

    await db.commit()
    return {"updated": updated, "total": len(rows)}


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
