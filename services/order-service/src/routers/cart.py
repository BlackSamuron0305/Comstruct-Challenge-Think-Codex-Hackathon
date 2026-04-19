from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from ..dependencies import CurrentUser, current_user
from ..schemas import CartLineIn, CartLineOut, CartOut
from ..services import cart_add, cart_clear, cart_get, cart_remove
from ..services.catalog_client import fetch_products

router = APIRouter(prefix="/cart", tags=["cart"])


def _to_out(line: dict) -> CartLineOut:
    return CartLineOut(**line)


def _total(lines: list[dict]) -> tuple[Decimal, str]:
    total = sum((Decimal(l["line_total"]) for l in lines), Decimal("0"))
    currency = lines[0]["currency"] if lines else "EUR"
    return total, currency


@router.get("", response_model=CartOut)
async def get_cart(user: CurrentUser = Depends(current_user)):
    lines = await cart_get(user.id)
    total, currency = _total(lines)
    return CartOut(items=[_to_out(l) for l in lines], total_amount=str(total), currency=currency)


@router.post("/add", response_model=CartOut)
async def add_to_cart(line: CartLineIn, user: CurrentUser = Depends(current_user)):
    products = await fetch_products([str(line.product_id)])
    p = products.get(str(line.product_id))
    if not p:
        raise HTTPException(404, "Product not found")
    if p.get("material_class") == "A":
        raise HTTPException(400, "A-materials cannot be ordered via C-materials platform")
    item = {
        "product_id": str(line.product_id),
        "supplier_id": p.get("supplier_id"),
        "supplier_name": p.get("supplier_name"),
        "name": p["name"],
        "sku": p["sku"],
        "category": p.get("category"),
        "taxonomy_code": p.get("taxonomy_code"),
        "taxonomy_label": p.get("taxonomy_label"),
        "material_class": p.get("material_class", "C"),
        "expected_delivery_days": str(p.get("expected_delivery_days")) if p.get("expected_delivery_days") is not None else None,
        "must_order": bool(p.get("must_order", False)),
        "base_discount_pct": str(p.get("base_discount_pct")) if p.get("base_discount_pct") is not None else None,
        "bulk_discount_pct": str(p.get("bulk_discount_pct")) if p.get("bulk_discount_pct") is not None else None,
        "bulk_discount_threshold": str(p.get("bulk_discount_threshold")) if p.get("bulk_discount_threshold") is not None else None,
        "special_info": p.get("special_info"),
        "quantity": float(line.quantity),
        "unit": p["unit"],
        "unit_price": str(p["unit_price"]),
        "currency": p["currency"],
    }
    await cart_add(user.id, item)
    lines = await cart_get(user.id)
    total, currency = _total(lines)
    return CartOut(items=[_to_out(l) for l in lines], total_amount=str(total), currency=currency)


@router.delete("/{product_id}", response_model=CartOut)
async def remove_from_cart(product_id: UUID, user: CurrentUser = Depends(current_user)):
    await cart_remove(user.id, product_id)
    lines = await cart_get(user.id)
    total, currency = _total(lines)
    return CartOut(items=[_to_out(l) for l in lines], total_amount=str(total), currency=currency)


@router.delete("", status_code=204)
async def clear_cart(user: CurrentUser = Depends(current_user)):
    await cart_clear(user.id)
