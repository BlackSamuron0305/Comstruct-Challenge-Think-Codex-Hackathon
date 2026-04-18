"""Seed dev catalog: ACME supplier + 8 C-materials from spec §11."""
import asyncio
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select

from ..db import SessionLocal
from ..models import Product, Supplier

ACME_ID = UUID("11111111-1111-1111-1111-111111111111")

PRODUCTS = [
    # (sku, name, unit, price EUR, category)
    ("C001", "Screws TX20 4x40",      "pcs",   "0.08",  "Fasteners"),
    ("C013", "Cable ties 200mm",      "pcs",   "0.06",  "Electrical"),
    ("C019", "Work gloves size 9",    "pair",  "2.50",  "PPE"),
    ("C025", "Painter fleece",        "roll", "18.00",  "Consumables"),
    ("C029", "Marking spray red",     "can",   "7.20",  "Consumables"),
    ("C035", "PU foam",               "can",   "6.50",  "Consumables"),
    ("C046", "Trash bags 120L",       "pcs",   "0.80",  "Site Supplies"),
    ("C056", "LED site lamp",         "pcs",  "29.00",  "Tools"),
]


async def seed():
    async with SessionLocal() as db:
        existing = await db.execute(select(Supplier).where(Supplier.id == ACME_ID))
        supplier = existing.scalar_one_or_none()
        if not supplier:
            supplier = Supplier(
                id=ACME_ID,
                name="ACME Construction Supplies",
                email="orders@acme-supplies.example",
                phone="+41 44 555 0100",
                contact_name="Hans Müller",
            )
            db.add(supplier)
            await db.flush()
            print(f"  + supplier {supplier.name}")

        for sku, name, unit, price, category in PRODUCTS:
            existing_p = await db.execute(
                select(Product).where(Product.supplier_id == ACME_ID, Product.sku == sku)
            )
            if existing_p.scalar_one_or_none():
                continue
            db.add(Product(
                supplier_id=ACME_ID,
                sku=sku,
                internal_sku=f"INT-{sku}",
                name=name,
                description=None,
                category=category,
                material_class="C",
                unit=unit,
                packaging_qty=Decimal("1"),
                unit_price=Decimal(price),
                currency="EUR",
                is_active=True,
            ))
            print(f"  + product {sku}  {name}")
        await db.commit()
    print("catalog seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
