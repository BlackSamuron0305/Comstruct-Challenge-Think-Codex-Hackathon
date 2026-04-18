"""initial catalog schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-04-18

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.execute("CREATE SCHEMA IF NOT EXISTS catalog")

    op.create_table(
        "suppliers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255)),
        sa.Column("phone", sa.String(64)),
        sa.Column("contact_name", sa.String(255)),
        sa.Column("avatar_url", sa.String(512)),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema="catalog",
    )

    op.create_table(
        "products",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("supplier_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("catalog.suppliers.id"), nullable=False),
        sa.Column("sku", sa.String(128), nullable=False),
        sa.Column("internal_sku", sa.String(128), nullable=False, index=True),
        sa.Column("name", sa.String(512), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("category", sa.String(64)),
        sa.Column("material_class", sa.String(2), nullable=False, server_default="C"),
        sa.Column("unit", sa.String(16), nullable=False),
        sa.Column("packaging_qty", sa.Numeric(12, 3), server_default="1"),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="CHF"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("embedding", Vector(1536)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("supplier_id", "sku", name="uq_supplier_sku"),
        schema="catalog",
    )

    op.create_index("ix_products_category", "products", ["category"], schema="catalog")
    op.create_index(
        "ix_products_material_class", "products", ["material_class"], schema="catalog"
    )
    op.execute(
        "CREATE INDEX ix_products_name_trgm ON catalog.products "
        "USING gin (name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX ix_products_embedding ON catalog.products "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )


def downgrade() -> None:
    op.drop_index("ix_products_embedding", table_name="products", schema="catalog")
    op.drop_index("ix_products_name_trgm", table_name="products", schema="catalog")
    op.drop_index("ix_products_material_class", table_name="products", schema="catalog")
    op.drop_index("ix_products_category", table_name="products", schema="catalog")
    op.drop_table("products", schema="catalog")
    op.drop_table("suppliers", schema="catalog")
