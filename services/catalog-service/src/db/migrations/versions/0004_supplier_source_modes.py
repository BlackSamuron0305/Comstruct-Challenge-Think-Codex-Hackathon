"""add supplier source mode flags

Revision ID: 0004_supplier_source_modes
Revises: 0003_procurement_meta
Create Date: 2026-04-19

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_supplier_source_modes"
down_revision: Union[str, None] = "0003_procurement_meta"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "suppliers",
        sa.Column("supports_api", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        schema="catalog",
    )
    op.add_column(
        "suppliers",
        sa.Column("supports_documents", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        schema="catalog",
    )

    op.execute(
        sa.text(
            """
            UPDATE catalog.suppliers
            SET supports_api = true,
                supports_documents = true
            WHERE name IN (
                'ACME Construction Supplies',
                'Swiss Fix AG',
                'ProSite Safety Outlet'
            )
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE catalog.suppliers
            SET supports_api = true,
                supports_documents = false
            WHERE name IN (
                'Alpine Fasteners AG',
                'Urban Build Tools'
            )
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE catalog.suppliers
            SET supports_api = false,
                supports_documents = true
            WHERE name IN (
                'Helvetia Safety GmbH',
                'Rhein Site Logistics',
                'Nordbau Trade Partner'
            )
            """
        )
    )


def downgrade() -> None:
    op.drop_column("suppliers", "supports_documents", schema="catalog")
    op.drop_column("suppliers", "supports_api", schema="catalog")
