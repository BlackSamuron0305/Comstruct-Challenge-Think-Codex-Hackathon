"""Seed dev catalog with overlapping supplier assortments for richer filtering and comparison demos."""
import asyncio
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select

from ..db import SessionLocal
from ..models import Product, Supplier
from ..taxonomy import infer_taxonomy_fields

SUPPLIERS = [
    {
        "id": UUID("11111111-1111-1111-1111-111111111111"),
        "name": "ACME Construction Supplies",
        "email": "orders@acme-supplies.example",
        "phone": "+41 44 555 0100",
        "contact_name": "Hans Müller",
    },
    {
        "id": UUID("22222222-2222-2222-2222-222222222222"),
        "name": "Alpine Fasteners AG",
        "email": "sales@alpine-fasteners.example",
        "phone": "+41 61 555 0131",
        "contact_name": "Petra Schmid",
    },
    {
        "id": UUID("33333333-3333-3333-3333-333333333333"),
        "name": "Helvetia Safety GmbH",
        "email": "procurement@helvetia-safety.example",
        "phone": "+41 43 555 0142",
        "contact_name": "Nina Graf",
    },
    {
        "id": UUID("44444444-4444-4444-4444-444444444444"),
        "name": "Rhein Site Logistics",
        "email": "logistics@rhein-site.example",
        "phone": "+41 52 555 0160",
        "contact_name": "Marco Frei",
    },
    {
        "id": UUID("55555555-5555-5555-5555-555555555555"),
        "name": "Nordbau Trade Partner",
        "email": "offers@nordbau-trade.example",
        "phone": "+41 31 555 0170",
        "contact_name": "Sabine Keller",
    },
    {
        "id": UUID("66666666-6666-6666-6666-666666666666"),
        "name": "Swiss Fix AG",
        "email": "orders@swiss-fix.example",
        "phone": "+41 44 555 0181",
        "contact_name": "Eva Huber",
    },
    {
        "id": UUID("77777777-7777-7777-7777-777777777777"),
        "name": "Urban Build Tools",
        "email": "sales@urban-build.example",
        "phone": "+41 61 555 0182",
        "contact_name": "Jonas Frei",
    },
    {
        "id": UUID("88888888-8888-8888-8888-888888888888"),
        "name": "ProSite Safety Outlet",
        "email": "service@prosite-outlet.example",
        "phone": "+41 31 555 0183",
        "contact_name": "Lea Baumann",
    },
]

PRODUCTS = [
    {"supplier": "ACME Construction Supplies", "sku": "C001", "name": "Screws TX20 4x40", "unit": "pcs", "price": "0.08", "category": "Fasteners", "description": "screw screws schraube torx fixing"},
    {"supplier": "ACME Construction Supplies", "sku": "C002", "name": "Concrete screws 7.5x80", "unit": "box", "price": "35.50", "category": "Anchors", "description": "concrete screws anchor heavy duty fixing"},
    {"supplier": "ACME Construction Supplies", "sku": "C003", "name": "Drywall screws 3.5x35 coarse", "unit": "box", "price": "17.90", "category": "Drywall", "description": "drywall screws gipsschrauben plasterboard trockenbau"},
    {"supplier": "ACME Construction Supplies", "sku": "C004", "name": "Anchor bolts M12", "unit": "box", "price": "40.90", "category": "Anchors", "description": "anchor bolts dübel fixing concrete"},
    {"supplier": "ACME Construction Supplies", "sku": "C007", "name": "Cable ties 200mm", "unit": "pcs", "price": "0.06", "category": "Electrical", "description": "cable ties zip tie binder"},
    {"supplier": "ACME Construction Supplies", "sku": "C010", "name": "LED site lamp", "unit": "pcs", "price": "29.00", "category": "Tools", "description": "led site lamp work light"},
    {"supplier": "ACME Construction Supplies", "sku": "C011", "name": "Work gloves size 9", "unit": "pair", "price": "2.50", "category": "PPE", "description": "work gloves handschuhe grip"},
    {"supplier": "ACME Construction Supplies", "sku": "C013", "name": "Dust masks FFP2 pack", "unit": "pack", "price": "14.90", "category": "PPE", "description": "mask masks respirator atemschutz ffp2"},
    {"supplier": "ACME Construction Supplies", "sku": "C018", "name": "Duct tape pro grade", "unit": "roll", "price": "4.90", "category": "Consumables", "description": "duct tape gewebeband repair"},
    {"supplier": "ACME Construction Supplies", "sku": "C020", "name": "Batteries AA industrial pack", "unit": "pack", "price": "9.80", "category": "Site Supplies", "description": "battery aa industrial pack"},
    {"supplier": "ACME Construction Supplies", "sku": "C022", "name": "PU foam", "unit": "can", "price": "6.50", "category": "Sanitary", "description": "pu foam schaum filler insulation"},
    {"supplier": "ACME Construction Supplies", "sku": "C024", "name": "Silicone white 310ml", "unit": "tube", "price": "5.90", "category": "Sanitary", "description": "silicone sealant white joint"},
    {"supplier": "ACME Construction Supplies", "sku": "C026", "name": "Cutting discs 125mm metal", "unit": "pack", "price": "16.80", "category": "Tools", "description": "cutting discs metal grinder"},
    {"supplier": "ACME Construction Supplies", "sku": "C028", "name": "Chalk line refill blue", "unit": "bottle", "price": "5.40", "category": "Site Supplies", "description": "chalk line refill blue marker"},

    {"supplier": "Alpine Fasteners AG", "sku": "ALP101", "name": "Concrete anchor screw 7.5 x 80", "unit": "box", "price": "33.40", "category": "Anchors", "description": "betonschraube fixing anchor screw concrete"},
    {"supplier": "Alpine Fasteners AG", "sku": "ALP102", "name": "Plasterboard screw 3.5x35 coarse", "unit": "box", "price": "18.30", "category": "Drywall", "description": "plasterboard screw gypsum board fixing"},
    {"supplier": "Alpine Fasteners AG", "sku": "ALP103", "name": "Anchor bolts M12 galvanized", "unit": "box", "price": "42.10", "category": "Anchors", "description": "m12 anchor bolt galvanized concrete fixing"},
    {"supplier": "Alpine Fasteners AG", "sku": "ALP104", "name": "TX20 universal screws 4x40", "unit": "pcs", "price": "0.09", "category": "Fasteners", "description": "universal screw tx20 4x40"},
    {"supplier": "Alpine Fasteners AG", "sku": "ALP105", "name": "Metal anchor for drywall", "unit": "box", "price": "17.40", "category": "Drywall", "description": "drywall anchor metal hollow wall"},
    {"supplier": "Alpine Fasteners AG", "sku": "ALP106", "name": "Washers M8 zinc coated", "unit": "pack", "price": "4.75", "category": "Fasteners", "description": "washer zinc coated m8"},

    {"supplier": "Helvetia Safety GmbH", "sku": "HEL201", "name": "Safety gloves grip size 9", "unit": "pair", "price": "2.70", "category": "PPE", "description": "safety gloves grip work gloves"},
    {"supplier": "Helvetia Safety GmbH", "sku": "HEL202", "name": "Nitrile work gloves XL", "unit": "pair", "price": "2.95", "category": "PPE", "description": "nitrile protective gloves xl"},
    {"supplier": "Helvetia Safety GmbH", "sku": "HEL203", "name": "FFP2 respirator pack", "unit": "pack", "price": "13.80", "category": "PPE", "description": "ffp2 respirator dust mask"},
    {"supplier": "Helvetia Safety GmbH", "sku": "HEL204", "name": "Hi-vis vest orange XL", "unit": "pcs", "price": "8.90", "category": "PPE", "description": "high visibility vest orange"},
    {"supplier": "Helvetia Safety GmbH", "sku": "HEL205", "name": "White safety helmet", "unit": "pcs", "price": "13.10", "category": "PPE", "description": "white hard hat helmet"},
    {"supplier": "Helvetia Safety GmbH", "sku": "HEL206", "name": "Site first aid refill", "unit": "pack", "price": "21.50", "category": "PPE", "description": "first aid site refill consumable"},

    {"supplier": "Rhein Site Logistics", "sku": "RHL301", "name": "Concrete screw bolt 7.5x80", "unit": "box", "price": "34.60", "category": "Anchors", "description": "concrete screw bolt anchor heavy duty"},
    {"supplier": "Rhein Site Logistics", "sku": "RHL302", "name": "Zip ties black 200 mm", "unit": "pcs", "price": "0.05", "category": "Electrical", "description": "zip ties cable ties black 200mm"},
    {"supplier": "Rhein Site Logistics", "sku": "RHL303", "name": "Heavy-duty site light LED", "unit": "pcs", "price": "31.20", "category": "Tools", "description": "site light led flood lamp"},
    {"supplier": "Rhein Site Logistics", "sku": "RHL304", "name": "Industrial extension lead 10 m", "unit": "pcs", "price": "27.10", "category": "Electrical", "description": "extension lead 10m construction power"},
    {"supplier": "Rhein Site Logistics", "sku": "RHL305", "name": "White joint sealant 310 ml", "unit": "tube", "price": "6.20", "category": "Sanitary", "description": "joint sealant white 310 ml silicone"},
    {"supplier": "Rhein Site Logistics", "sku": "RHL306", "name": "Gewebeband premium", "unit": "roll", "price": "5.20", "category": "Consumables", "description": "duct tape premium gewebeband"},
    {"supplier": "Rhein Site Logistics", "sku": "RHL307", "name": "Concrete repair mortar 5kg", "unit": "bag", "price": "15.40", "category": "Concrete", "description": "repair mortar concrete patch"},

    {"supplier": "Nordbau Trade Partner", "sku": "NTP401", "name": "Betonschraube 7,5x80 verzinkt", "unit": "box", "price": "36.10", "category": "Anchors", "description": "betonschraube verzinkt concrete screw german naming"},
    {"supplier": "Nordbau Trade Partner", "sku": "NTP402", "name": "Trockenbauschraube 3,5x35 grob", "unit": "box", "price": "17.60", "category": "Drywall", "description": "trockenbau schraube drywall coarse thread"},
    {"supplier": "Nordbau Trade Partner", "sku": "NTP403", "name": "Kabelbinder 200mm schwarz", "unit": "pcs", "price": "0.05", "category": "Electrical", "description": "kabelbinder zip tie 200 mm black"},
    {"supplier": "Nordbau Trade Partner", "sku": "NTP404", "name": "Sanitär Silikon weiss 310ml", "unit": "tube", "price": "5.70", "category": "Sanitary", "description": "sanitary silicone white sealant 310ml"},
    {"supplier": "Nordbau Trade Partner", "sku": "NTP405", "name": "Ankerbolzen M12 Stahl", "unit": "box", "price": "39.90", "category": "Anchors", "description": "anchor bolts m12 steel"},
    {"supplier": "Nordbau Trade Partner", "sku": "NTP406", "name": "Bauhandschuhe Grösse 9", "unit": "pair", "price": "2.65", "category": "PPE", "description": "construction gloves size 9"},
    {"supplier": "Nordbau Trade Partner", "sku": "NTP407", "name": "Montageband grau", "unit": "roll", "price": "4.80", "category": "Consumables", "description": "mounting tape grey duct tape equivalent"},
    {"supplier": "Nordbau Trade Partner", "sku": "NTP408", "name": "Baustellenlampe LED kompakt", "unit": "pcs", "price": "28.60", "category": "Tools", "description": "compact led site lamp"},
    {"supplier": "ACME Construction Supplies", "sku": "C029", "name": "Torx screws 4x40 zinc", "unit": "pcs", "price": "0.09", "category": "Fasteners", "description": "torx screw 4x40 zinc plated variant"},
    {"supplier": "ACME Construction Supplies", "sku": "C030", "name": "Site flood light LED 50W", "unit": "pcs", "price": "33.50", "category": "Tools", "description": "site flood light led 50w"},
    {"supplier": "Alpine Fasteners AG", "sku": "ALP107", "name": "Concrete screw 7.5x80 zinc", "unit": "box", "price": "34.90", "category": "Anchors", "description": "concrete screw zinc 7.5x80"},
    {"supplier": "Alpine Fasteners AG", "sku": "ALP108", "name": "Universal TX screw 4x40", "unit": "pcs", "price": "0.10", "category": "Fasteners", "description": "tx screw 4x40 universal fastener"},
    {"supplier": "Helvetia Safety GmbH", "sku": "HEL207", "name": "Respirator masks FFP2 contractor pack", "unit": "pack", "price": "15.20", "category": "PPE", "description": "contractor respirator masks ffp2"},
    {"supplier": "Helvetia Safety GmbH", "sku": "HEL208", "name": "Grip work glove size 9", "unit": "pair", "price": "2.55", "category": "PPE", "description": "grip glove size 9 work"},
    {"supplier": "Rhein Site Logistics", "sku": "RHL308", "name": "Cable binder 200mm black", "unit": "pcs", "price": "0.05", "category": "Electrical", "description": "cable binder 200 black zip tie variant"},
    {"supplier": "Rhein Site Logistics", "sku": "RHL309", "name": "LED floodlight site compact", "unit": "pcs", "price": "30.80", "category": "Tools", "description": "compact site floodlight led"},
    {"supplier": "Nordbau Trade Partner", "sku": "NTP409", "name": "TX20 Schrauben 4x40 verzinkt", "unit": "pcs", "price": "0.09", "category": "Fasteners", "description": "german tx20 screw 4x40 zinc"},
    {"supplier": "Nordbau Trade Partner", "sku": "NTP410", "name": "Baustrahler LED 50W", "unit": "pcs", "price": "29.40", "category": "Tools", "description": "baustrahler led 50w compact"},
    {"supplier": "Nordbau Trade Partner", "sku": "NTP411", "name": "Atemschutzmaske FFP2 Profipack", "unit": "pack", "price": "14.60", "category": "PPE", "description": "ffp2 mask professional pack"},

    {"supplier": "Swiss Fix AG", "sku": "SFX501", "name": "Claw hammer 16oz", "unit": "pcs", "price": "18.50", "category": "Tools", "description": "claw hammer carpenter hammer for nails"},
    {"supplier": "Swiss Fix AG", "sku": "SFX502", "name": "Sledge hammer 5kg", "unit": "pcs", "price": "65.00", "category": "Tools", "description": "sledge hammer heavy demolition tool"},
    {"supplier": "Swiss Fix AG", "sku": "SFX503", "name": "Concrete screws 8mm pack", "unit": "box", "price": "38.90", "category": "Anchors", "description": "concrete screws 8mm anchor fixing"},
    {"supplier": "Swiss Fix AG", "sku": "SFX504", "name": "Hex nuts zinc-plated M10", "unit": "pack", "price": "5.40", "category": "Fasteners", "description": "hex nuts zinc plated m10"},
    {"supplier": "Swiss Fix AG", "sku": "SFX505", "name": "Joint filler drywall 5kg", "unit": "bag", "price": "12.80", "category": "Drywall", "description": "joint filler for drywall finishing"},

    {"supplier": "Urban Build Tools", "sku": "UBT601", "name": "Extension cable 25m", "unit": "pcs", "price": "34.50", "category": "Electrical", "description": "extension cable 25m heavy duty"},
    {"supplier": "Urban Build Tools", "sku": "UBT602", "name": "Electrical tape red", "unit": "roll", "price": "3.10", "category": "Electrical", "description": "red electrical insulation tape"},
    {"supplier": "Urban Build Tools", "sku": "UBT603", "name": "Foam backer rod 10mm", "unit": "roll", "price": "7.20", "category": "Sanitary", "description": "foam backer rod 10mm joint fill"},
    {"supplier": "Urban Build Tools", "sku": "UBT604", "name": "Cleaning wipes construction", "unit": "pack", "price": "6.90", "category": "Site Supplies", "description": "construction cleaning wipes"},
    {"supplier": "Urban Build Tools", "sku": "UBT605", "name": "Hard hats white", "unit": "pcs", "price": "12.90", "category": "PPE", "description": "white hard hats site safety"},

    {"supplier": "ProSite Safety Outlet", "sku": "PSO701", "name": "High-vis safety vest XL", "unit": "pcs", "price": "9.10", "category": "PPE", "description": "high visibility safety vest xl"},
    {"supplier": "ProSite Safety Outlet", "sku": "PSO702", "name": "Anchor bolts M12 premium", "unit": "box", "price": "41.70", "category": "Anchors", "description": "premium anchor bolts m12"},
    {"supplier": "ProSite Safety Outlet", "sku": "PSO703", "name": "Expanding foam fire-rated", "unit": "can", "price": "8.40", "category": "Sanitary", "description": "fire rated expanding foam"},
    {"supplier": "ProSite Safety Outlet", "sku": "PSO704", "name": "Cable ties 300mm heavy duty", "unit": "pack", "price": "4.90", "category": "Electrical", "description": "cable ties 300mm heavy duty"},
    {"supplier": "ProSite Safety Outlet", "sku": "PSO705", "name": "Drywall metal anchors", "unit": "box", "price": "19.20", "category": "Drywall", "description": "metal anchors for drywall"},
]

STARTER_PACK_TEMPLATES = [
    {"sku_suffix": "901", "name": "Starter site screws 4x40", "unit": "pcs", "price": "0.09", "category": "Fasteners", "description": "starter torx screws for first catalog coverage"},
    {"sku_suffix": "902", "name": "Starter anchor bolts M12", "unit": "box", "price": "38.90", "category": "Anchors", "description": "starter anchor bolts for structural fixing"},
    {"sku_suffix": "903", "name": "Starter work gloves size 9", "unit": "pair", "price": "2.80", "category": "PPE", "description": "starter site glove assortment"},
    {"sku_suffix": "904", "name": "Starter cable ties 200mm", "unit": "pack", "price": "4.60", "category": "Electrical", "description": "starter electrical fastening pack"},
    {"sku_suffix": "905", "name": "Starter silicone white 310ml", "unit": "tube", "price": "5.80", "category": "Sanitary", "description": "starter sealant assortment for site works"},
    {"sku_suffix": "906", "name": "Starter LED site lamp", "unit": "pcs", "price": "28.40", "category": "Tools", "description": "starter lighting line for immediate use"},
]


def starter_products_for_supplier(supplier_name: str) -> list[dict[str, str]]:
    prefix = "".join(char for char in supplier_name.upper() if char.isalnum())[:3] or "SUP"
    return [
        {
            "supplier": supplier_name,
            "sku": f"{prefix}{template['sku_suffix']}",
            "name": template["name"],
            "unit": template["unit"],
            "price": template["price"],
            "category": template["category"],
            "description": f"{template['description']} · seeded automatically for {supplier_name.lower()}",
            "source": "auto-topup",
        }
        for template in STARTER_PACK_TEMPLATES
    ]


async def upsert_product(db, supplier_id: UUID, product: dict) -> None:
    existing_p = await db.execute(
        select(Product).where(Product.supplier_id == supplier_id, Product.sku == product["sku"])
    )
    row = existing_p.scalar_one_or_none()
    if row is None:
        row = Product(
            supplier_id=supplier_id,
            sku=product["sku"],
            internal_sku=f"INT-{product['sku']}",
            material_class="C",
            packaging_qty=Decimal("1"),
            currency="CHF",
            is_active=True,
        )
        db.add(row)

    taxonomy = infer_taxonomy_fields(product)
    row.name = product["name"]
    row.description = product["description"]
    row.category = product["category"]
    row.manufacturer = product.get("manufacturer") or product["supplier"]
    row.manufacturer_sku = product.get("manufacturer_sku") or product["sku"]
    row.ean = product.get("ean") or f"761{abs(hash(product['sku'])) % 1000000000:09d}"
    row.image_url = product.get("image_url")
    row.special_info = {
        "source": product.get("source", "seeded-demo"),
        "finish": "zinc-coated" if any(token in product["name"].lower() for token in ["zinc", "verzinkt", "galvanized"]) else "standard",
        "project_fit": product["category"],
    }
    row.taxonomy_code = taxonomy["taxonomy_code"]
    row.taxonomy_label = taxonomy["taxonomy_label"]
    row.unit = product["unit"]
    row.unit_price = Decimal(product["price"])
    row.currency = "CHF"
    row.source_delivery_days = Decimal(str(product.get("source_delivery_days") or (1.0 if "Safety" in product["supplier"] else 2.0 if "Swiss Fix" in product["supplier"] else 3.0)))
    row.must_order = bool(product.get("must_order") or product["category"] == "PPE")
    row.base_discount_pct = Decimal(str(product.get("base_discount_pct") or (2.5 if row.must_order else 0)))
    row.bulk_discount_pct = Decimal(str(product.get("bulk_discount_pct") or (6 if product["unit"] in {"pcs", "pack"} else 4)))
    row.bulk_discount_threshold = Decimal(str(product.get("bulk_discount_threshold") or (50 if product["unit"] in {"pcs", "pack"} else 10)))
    row.is_active = True
    print(f"  + product {product['sku']}  {product['name']} · {product['supplier']}")


async def seed():
    async with SessionLocal() as db:
        supplier_ids: dict[str, UUID] = {}

        for spec in SUPPLIERS:
            existing = await db.execute(
                select(Supplier).where(func.lower(Supplier.name) == spec["name"].lower())
            )
            supplier = existing.scalar_one_or_none()
            if supplier is None:
                supplier = Supplier(**spec)
                db.add(supplier)
                await db.flush()
                print(f"  + supplier {supplier.name}")
            else:
                supplier.email = spec["email"]
                supplier.phone = spec["phone"]
                supplier.contact_name = spec["contact_name"]
            supplier_ids[spec["name"]] = supplier.id

        for product in PRODUCTS:
            await upsert_product(db, supplier_ids[product["supplier"]], product)

        active_suppliers = (
            await db.execute(select(Supplier).where(Supplier.is_active.is_(True)).order_by(Supplier.name))
        ).scalars().all()
        for supplier in active_suppliers:
            product_count = (
                await db.execute(
                    select(func.count(Product.id)).where(
                        Product.supplier_id == supplier.id,
                        Product.is_active.is_(True),
                    )
                )
            ).scalar_one()
            if product_count == 0:
                print(f"  · top-up starter catalog for {supplier.name}")
                for product in starter_products_for_supplier(supplier.name):
                    await upsert_product(db, supplier.id, product)

        await db.commit()
    print("catalog seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
