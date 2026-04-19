"""Seed orders/auth/audit dev data with a large statistical approval test set."""
import asyncio
from decimal import Decimal
from uuid import UUID, NAMESPACE_DNS, uuid4, uuid5

import bcrypt
from sqlalchemy import select

from ..db import SessionLocal
from ..models import ApprovalRule, Company, Order, OrderItem, OrderStatus, Project, User, UserRole


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

COMPANY_ID = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
PROJECT_ID = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
PROJECT_2_ID = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc")
PROJECT_3_ID = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbd")
PROJECT_4_ID = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbe")
PROJECT_5_ID = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbf")
PROJECT_6_ID = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbc0")
PROC_ID = UUID("cccccccc-cccc-cccc-cccc-cccccccccc03")
FOREMAN_1_ID = UUID("cccccccc-cccc-cccc-cccc-cccccccccc01")
FOREMAN_2_ID = UUID("cccccccc-cccc-cccc-cccc-cccccccccc02")
FOREMAN_3_ID = UUID("cccccccc-cccc-cccc-cccc-cccccccccc04")
FOREMAN_4_ID = UUID("cccccccc-cccc-cccc-cccc-cccccccccc05")

DEMO_PASSWORD = "comstruct-demo"

PROJECTS = [
    (PROJECT_ID, "Brücke St. Gallen", "Steel/Bridge", "Brückenstrasse 1, 9000 St. Gallen"),
    (PROJECT_2_ID, "Werkhof Zürich West", "Civil/Concrete", "Industriestrasse 18, 8048 Zürich"),
    (PROJECT_3_ID, "Campus Basel Nord", "Drywall/Interior", "Voltastrasse 90, 4056 Basel"),
    (PROJECT_4_ID, "Wohnpark Wil", "Residential Fit-out", "Bahnhofplatz 7, 9500 Wil"),
    (PROJECT_5_ID, "Tunnel Bern Süd", "Infrastructure", "Baustellenweg 11, 3008 Bern"),
    (PROJECT_6_ID, "Logistik Hub Luzern", "Warehouse Retrofit", "Industriepark 4, 6005 Luzern"),
]

USERS = [
    (PROC_ID, "procurement@comstruct.com", "Lukas Weber", UserRole.PROCUREMENT_WORKER.value, "+41 79 100 0003"),
    (FOREMAN_1_ID, "foreman@brueckesg.ch", "Marco Brunner", UserRole.FOREMAN.value, "+41 79 100 0001"),
    (FOREMAN_2_ID, "sitelead@comstruct.com", "Anna Steiner", UserRole.FOREMAN.value, "+41 79 100 0002"),
    (FOREMAN_3_ID, "basel.foreman@comstruct.com", "Murat Steiner", UserRole.FOREMAN.value, "+41 79 100 0004"),
    (FOREMAN_4_ID, "infra.foreman@comstruct.com", "Elena Brunner", UserRole.FOREMAN.value, "+41 79 100 0005"),
]

PENDING_SCENARIOS = [
    {
        "reason": "Statistical quantity anomaly detected for anchor screws versus project baseline",
        "items": [
            {"sku": "C002", "name": "Concrete screws 7.5x80", "supplier_name": "ACME Construction Supplies", "quantity": "18", "unit": "box", "unit_price": "35.50"},
            {"sku": "ALP107", "name": "Concrete screw 7.5x80 zinc", "supplier_name": "Alpine Fasteners AG", "quantity": "9", "unit": "box", "unit_price": "34.90"},
        ],
    },
    {
        "reason": "Restricted category requested: PPE restock above weekend shutdown norm",
        "items": [
            {"sku": "HEL203", "name": "FFP2 respirator pack", "supplier_name": "Helvetia Safety GmbH", "quantity": "20", "unit": "pack", "unit_price": "13.80"},
            {"sku": "HEL205", "name": "White safety helmet", "supplier_name": "Helvetia Safety GmbH", "quantity": "12", "unit": "pcs", "unit_price": "13.10"},
        ],
    },
    {
        "reason": "Duplicate sealant items from multiple suppliers need commercial consolidation",
        "items": [
            {"sku": "C024", "name": "Silicone white 310ml", "supplier_name": "ACME Construction Supplies", "quantity": "24", "unit": "tube", "unit_price": "5.90"},
            {"sku": "RHL305", "name": "White joint sealant 310 ml", "supplier_name": "Rhein Site Logistics", "quantity": "24", "unit": "tube", "unit_price": "6.20"},
            {"sku": "NTP404", "name": "Sanitär Silikon weiss 310ml", "supplier_name": "Nordbau Trade Partner", "quantity": "16", "unit": "tube", "unit_price": "5.70"},
        ],
    },
    {
        "reason": "A-material guard triggered for anchor bolts and lighting bundle",
        "items": [
            {"sku": "C004", "name": "Anchor bolts M12", "supplier_name": "ACME Construction Supplies", "quantity": "8", "unit": "box", "unit_price": "40.90"},
            {"sku": "RHL303", "name": "Heavy-duty site light LED", "supplier_name": "Rhein Site Logistics", "quantity": "5", "unit": "pcs", "unit_price": "31.20"},
        ],
    },
    {
        "reason": "Drywall screw demand spiked above expected fit-out consumption",
        "items": [
            {"sku": "C003", "name": "Drywall screws 3.5x35 coarse", "supplier_name": "ACME Construction Supplies", "quantity": "22", "unit": "box", "unit_price": "17.90"},
            {"sku": "NTP402", "name": "Trockenbauschraube 3,5x35 grob", "supplier_name": "Nordbau Trade Partner", "quantity": "20", "unit": "box", "unit_price": "17.60"},
        ],
    },
    {
        "reason": "Supplier price spread exceeds tolerance for same material family",
        "items": [
            {"sku": "C030", "name": "Site flood light LED 50W", "supplier_name": "ACME Construction Supplies", "quantity": "6", "unit": "pcs", "unit_price": "33.50"},
            {"sku": "NTP410", "name": "Baustrahler LED 50W", "supplier_name": "Nordbau Trade Partner", "quantity": "6", "unit": "pcs", "unit_price": "29.40"},
            {"sku": "RHL309", "name": "LED floodlight site compact", "supplier_name": "Rhein Site Logistics", "quantity": "6", "unit": "pcs", "unit_price": "30.80"},
        ],
    },
    {
        "reason": "Hammer subtype request spiked above statistical norm for the current site phase",
        "items": [
            {"sku": "SFX501", "name": "Claw hammer 16oz", "supplier_name": "Swiss Fix AG", "quantity": "6", "unit": "pcs", "unit_price": "18.50"},
            {"sku": "SFX502", "name": "Sledge hammer 5kg", "supplier_name": "Swiss Fix AG", "quantity": "4", "unit": "pcs", "unit_price": "65.00"},
        ],
    },
]

HISTORY_SCENARIOS = [
    {
        "status": OrderStatus.APPROVED.value,
        "requires_approval": False,
        "reason": "Routine cable and marking supply top-up auto-cleared after review.",
        "items": [
            {"sku": "RHL302", "name": "Zip ties black 200 mm", "supplier_name": "Rhein Site Logistics", "quantity": "120", "unit": "pcs", "unit_price": "0.05"},
            {"sku": "C028", "name": "Chalk line refill blue", "supplier_name": "ACME Construction Supplies", "quantity": "8", "unit": "bottle", "unit_price": "5.40"},
        ],
    },
    {
        "status": OrderStatus.ORDERED.value,
        "requires_approval": False,
        "reason": "Routine replenishment based on historical trend.",
        "items": [
            {"sku": "HEL208", "name": "Grip work glove size 9", "supplier_name": "Helvetia Safety GmbH", "quantity": "30", "unit": "pair", "unit_price": "2.55"},
            {"sku": "NTP406", "name": "Bauhandschuhe Grösse 9", "supplier_name": "Nordbau Trade Partner", "quantity": "24", "unit": "pair", "unit_price": "2.65"},
        ],
    },
    {
        "status": OrderStatus.DELIVERED.value,
        "requires_approval": False,
        "reason": "Delivered as planned for scheduled fit-out works.",
        "items": [
            {"sku": "ALP104", "name": "TX20 universal screws 4x40", "supplier_name": "Alpine Fasteners AG", "quantity": "900", "unit": "pcs", "unit_price": "0.09"},
            {"sku": "NTP409", "name": "TX20 Schrauben 4x40 verzinkt", "supplier_name": "Nordbau Trade Partner", "quantity": "900", "unit": "pcs", "unit_price": "0.09"},
        ],
    },
    {
        "status": OrderStatus.REJECTED.value,
        "requires_approval": True,
        "reason": "[approval] Duplicate supplier quote rejected in favour of framework pricing",
        "items": [
            {"sku": "ALP102", "name": "Plasterboard screw 3.5x35 coarse", "supplier_name": "Alpine Fasteners AG", "quantity": "14", "unit": "box", "unit_price": "18.30"},
            {"sku": "NTP402", "name": "Trockenbauschraube 3,5x35 grob", "supplier_name": "Nordbau Trade Partner", "quantity": "14", "unit": "box", "unit_price": "17.60"},
        ],
    },
]


def scaled_items(items: list[dict[str, str]], factor: Decimal) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    for item in items:
        quantity = (Decimal(item["quantity"]) * factor).quantize(Decimal("0.001"))
        if quantity == quantity.to_integral():
            quantity_text = str(int(quantity))
        else:
            quantity_text = format(quantity.normalize(), "f")
        result.append({**item, "quantity": quantity_text})
    return result


def order_total(items: list[dict[str, str]]) -> Decimal:
    total = Decimal("0")
    for item in items:
        total += Decimal(item["quantity"]) * Decimal(item["unit_price"])
    return total.quantize(Decimal("0.01"))


def build_orders() -> list[dict]:
    demo_orders: list[dict] = []
    foremen = [FOREMAN_1_ID, FOREMAN_2_ID, FOREMAN_3_ID, FOREMAN_4_ID]

    for index in range(36):
        template = PENDING_SCENARIOS[index % len(PENDING_SCENARIOS)]
        factor = Decimal("1") + (Decimal(index % 4) * Decimal("0.15"))
        demo_orders.append({
            "id": uuid5(NAMESPACE_DNS, f"comstruct-pending-{index}"),
            "project_id": PROJECTS[index % len(PROJECTS)][0],
            "foreman_id": foremen[index % len(foremen)],
            "status": OrderStatus.PENDING_APPROVAL.value,
            "requires_approval": True,
            "notes": f"[approval] {template['reason']} · sample {index + 1}",
            "items": scaled_items(template["items"], factor),
        })

    for index in range(120):
        template = HISTORY_SCENARIOS[index % len(HISTORY_SCENARIOS)]
        factor = Decimal("1") + (Decimal(index % 5) * Decimal("0.1"))
        demo_orders.append({
            "id": uuid5(NAMESPACE_DNS, f"comstruct-history-{index}"),
            "project_id": PROJECTS[index % len(PROJECTS)][0],
            "foreman_id": foremen[(index + 1) % len(foremen)],
            "status": template["status"],
            "requires_approval": template["requires_approval"],
            "notes": template["reason"],
            "items": scaled_items(template["items"], factor),
        })

    return demo_orders


DEMO_ORDERS = build_orders()


async def seed():
    async with SessionLocal() as db:
        if not (await db.execute(select(Company).where(Company.id == COMPANY_ID))).scalar_one_or_none():
            db.add(Company(id=COMPANY_ID, name="Brücke St. Gallen AG"))
            print("  + company Brücke St. Gallen AG")

        for project_id, name, trade, address in PROJECTS:
            if not (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none():
                db.add(Project(id=project_id, company_id=COMPANY_ID, name=name, trade=trade, site_address=address))
                print(f"  + project {name}")

        for uid, email, name, role, phone in USERS:
            if (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none():
                continue
            db.add(User(
                id=uid,
                company_id=COMPANY_ID,
                email=email,
                full_name=name,
                role=role,
                phone=phone,
                password_hash=hash_password(DEMO_PASSWORD),
            ))
            print(f"  + user {email} ({role})")

        rule_q = await db.execute(select(ApprovalRule).where(ApprovalRule.company_id == COMPANY_ID))
        if not rule_q.scalar_one_or_none():
            db.add(ApprovalRule(
                company_id=COMPANY_ID,
                threshold_amount=Decimal("200.00"),
                auto_approve_below=True,
                restricted_categories=["PPE", "Anchors", "Electrical"],
                approver_role=UserRole.PROCUREMENT_WORKER.value,
            ))
            print("  + default approval rule (threshold 200 CHF)")

        await db.flush()

        for spec in DEMO_ORDERS:
            existing_order = await db.execute(select(Order).where(Order.id == spec["id"]))
            if existing_order.scalar_one_or_none() is not None:
                continue

            order = Order(
                id=spec["id"],
                company_id=COMPANY_ID,
                project_id=spec["project_id"],
                foreman_id=spec["foreman_id"],
                status=spec["status"],
                currency="CHF",
                requires_approval=spec["requires_approval"],
                notes=spec["notes"],
                total_amount=order_total(spec["items"]),
            )
            db.add(order)
            await db.flush()

            for item in spec["items"]:
                quantity = Decimal(item["quantity"])
                unit_price = Decimal(item["unit_price"])
                db.add(OrderItem(
                    order_id=order.id,
                    product_id=uuid4(),
                    product_snapshot={
                        "sku": item["sku"],
                        "name": item["name"],
                        "supplier_name": item["supplier_name"],
                    },
                    quantity=quantity,
                    unit=item["unit"],
                    unit_price=unit_price,
                    line_total=(quantity * unit_price).quantize(Decimal("0.01")),
                ))
            print(f"  + order {str(order.id)[:8]} ({spec['status']})")

        await db.commit()
    print("orders seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
