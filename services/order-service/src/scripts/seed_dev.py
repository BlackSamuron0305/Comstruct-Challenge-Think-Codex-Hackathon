"""Seed orders/auth/audit dev data: company, project, procurement user, default approval rule."""
import asyncio
from decimal import Decimal
from uuid import UUID

import bcrypt
from sqlalchemy import select

from ..db import SessionLocal
from ..models import ApprovalRule, Company, Project, User, UserRole


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

COMPANY_ID = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
PROJECT_ID = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
FOREMAN_ID = UUID("cccccccc-cccc-cccc-cccc-cccccccccc01")
PM_ID = UUID("cccccccc-cccc-cccc-cccc-cccccccccc02")
PROC_ID = UUID("cccccccc-cccc-cccc-cccc-cccccccccc03")

DEMO_PASSWORD = "comstruct-demo"

USERS = [
    (FOREMAN_ID, "foreman@brueckesg.ch", "Marco Brunner", UserRole.FOREMAN.value, "+41 79 100 0001"),
    (PM_ID, "pm@brueckesg.ch", "Anna Steiner", UserRole.PROCUREMENT_WORKER.value, "+41 79 100 0002"),
    (PROC_ID, "procurement@comstruct.com", "Lukas Weber", UserRole.PROCUREMENT_WORKER.value, "+41 79 100 0003"),
]


async def seed():
    async with SessionLocal() as db:
        if not (await db.execute(select(Company).where(Company.id == COMPANY_ID))).scalar_one_or_none():
            db.add(Company(id=COMPANY_ID, name="Brücke St. Gallen AG"))
            print("  + company Brücke St. Gallen AG")

        if not (await db.execute(select(Project).where(Project.id == PROJECT_ID))).scalar_one_or_none():
            db.add(Project(
                id=PROJECT_ID, company_id=COMPANY_ID,
                name="Brücke St. Gallen", trade="Steel/Bridge",
                site_address="Brückenstrasse 1, 9000 St. Gallen",
            ))
            print("  + project Brücke St. Gallen")

        for uid, email, name, role, phone in USERS:
            if (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none():
                continue
            db.add(User(
                id=uid, company_id=COMPANY_ID, email=email,
                full_name=name, role=role, phone=phone,
                password_hash=hash_password(DEMO_PASSWORD),
            ))
            print(f"  + user {email} ({role})")

        rule_q = await db.execute(
            select(ApprovalRule).where(ApprovalRule.company_id == COMPANY_ID)
        )
        if not rule_q.scalar_one_or_none():
            db.add(ApprovalRule(
                company_id=COMPANY_ID,
                threshold_amount=Decimal("200.00"),
                auto_approve_below=True,
                restricted_categories=[],
                approver_role=UserRole.PROCUREMENT_WORKER.value,
            ))
            print("  + default approval rule (threshold 200 CHF)")

        await db.commit()
    print("orders seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
