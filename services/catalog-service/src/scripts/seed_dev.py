"""Seed dev catalog with a broader ACME demo assortment for filtering and showcase flows."""
import asyncio
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select

from ..db import SessionLocal
from ..models import Product, Supplier

ACME_ID = UUID("11111111-1111-1111-1111-111111111111")

PRODUCTS = [
    {"sku": "C001", "name": "Screws TX20 4x40", "unit": "pcs", "price": "0.08", "category": "Fasteners", "description": "screw screws schraube torx fixing"},
    {"sku": "C002", "name": "Concrete screws 7.5x80", "unit": "box", "price": "35.50", "category": "Anchors", "description": "concrete screws anchor heavy duty fixing"},
    {"sku": "C003", "name": "Drywall screws 3.5x35 coarse", "unit": "box", "price": "17.90", "category": "Drywall", "description": "drywall screws gipsschrauben plasterboard trockenbau"},
    {"sku": "C004", "name": "Anchor bolts M12", "unit": "box", "price": "40.90", "category": "Anchors", "description": "anchor bolts dübel fixing concrete"},
    {"sku": "C005", "name": "Washer set galvanized M8", "unit": "pack", "price": "4.60", "category": "Fasteners", "description": "washers galvanized fastener fixing"},
    {"sku": "C006", "name": "Hex nuts zinc-plated M10", "unit": "pack", "price": "5.20", "category": "Fasteners", "description": "nuts zinc plated fastener fixing"},
    {"sku": "C007", "name": "Cable ties 200mm", "unit": "pcs", "price": "0.06", "category": "Electrical", "description": "cable ties zip tie binder"},
    {"sku": "C008", "name": "Electrical insulation tape black", "unit": "roll", "price": "2.80", "category": "Electrical", "description": "insulation tape electrical band"},
    {"sku": "C009", "name": "Extension cable 10m heavy duty", "unit": "pcs", "price": "26.50", "category": "Electrical", "description": "extension cable site power"},
    {"sku": "C010", "name": "LED site lamp", "unit": "pcs", "price": "29.00", "category": "Tools", "description": "led site lamp work light"},
    {"sku": "C011", "name": "Work gloves size 9", "unit": "pair", "price": "2.50", "category": "PPE", "description": "work gloves handschuhe grip"},
    {"sku": "C012", "name": "Nitrile gloves size 10", "unit": "pair", "price": "2.80", "category": "PPE", "description": "nitrile gloves handschuhe"},
    {"sku": "C013", "name": "Dust masks FFP2 pack", "unit": "pack", "price": "14.90", "category": "PPE", "description": "mask masks respirator atemschutz ffp2"},
    {"sku": "C014", "name": "Hard hats white", "unit": "pcs", "price": "13.60", "category": "PPE", "description": "hard hat helmet helm safety"},
    {"sku": "C015", "name": "High-vis safety vest XL", "unit": "pcs", "price": "8.40", "category": "PPE", "description": "safety vest high visibility"},
    {"sku": "C016", "name": "Painter fleece", "unit": "roll", "price": "18.00", "category": "Consumables", "description": "painter fleece floor protection"},
    {"sku": "C017", "name": "Marking spray red", "unit": "can", "price": "7.20", "category": "Consumables", "description": "marking spray marker chalk red"},
    {"sku": "C018", "name": "Duct tape pro grade", "unit": "roll", "price": "4.90", "category": "Consumables", "description": "duct tape gewebeband repair"},
    {"sku": "C019", "name": "Trash bags 120L", "unit": "pcs", "price": "0.80", "category": "Site Supplies", "description": "trash bags sack rubble waste"},
    {"sku": "C020", "name": "Batteries AA industrial pack", "unit": "pack", "price": "9.80", "category": "Site Supplies", "description": "battery aa industrial pack"},
    {"sku": "C021", "name": "Cleaning wipes construction", "unit": "pack", "price": "6.20", "category": "Site Supplies", "description": "cleaner wipes construction hand cleaning"},
    {"sku": "C022", "name": "PU foam", "unit": "can", "price": "6.50", "category": "Sanitary", "description": "pu foam schaum filler insulation"},
    {"sku": "C023", "name": "Foam backer rod 10mm", "unit": "roll", "price": "8.70", "category": "Sanitary", "description": "foam backer rod sealing"},
    {"sku": "C024", "name": "Silicone white 310ml", "unit": "tube", "price": "5.90", "category": "Sanitary", "description": "silicone sealant white joint"},
    {"sku": "C025", "name": "Utility knife heavy duty", "unit": "pcs", "price": "11.20", "category": "Tools", "description": "utility knife cutter heavy duty"},
    {"sku": "C026", "name": "Cutting discs 125mm metal", "unit": "pack", "price": "16.80", "category": "Tools", "description": "cutting discs metal grinder"},
    {"sku": "C027", "name": "Measuring tape 5m", "unit": "pcs", "price": "7.10", "category": "Tools", "description": "measuring tape 5m"},
    {"sku": "C028", "name": "Chalk line refill blue", "unit": "bottle", "price": "5.40", "category": "Site Supplies", "description": "chalk line refill blue marker"},
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

        for product in PRODUCTS:
            existing_p = await db.execute(
                select(Product).where(Product.supplier_id == ACME_ID, Product.sku == product["sku"])
            )
            row = existing_p.scalar_one_or_none()
            if row is None:
                row = Product(
                    supplier_id=ACME_ID,
                    sku=product["sku"],
                    internal_sku=f"INT-{product['sku']}",
                    material_class="C",
                    packaging_qty=Decimal("1"),
                    currency="EUR",
                    is_active=True,
                )
                db.add(row)

            row.name = product["name"]
            row.description = product["description"]
            row.category = product["category"]
            row.unit = product["unit"]
            row.unit_price = Decimal(product["price"])
            row.currency = "EUR"
            row.is_active = True
            print(f"  + product {product['sku']}  {product['name']}")
        await db.commit()
    print("catalog seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
