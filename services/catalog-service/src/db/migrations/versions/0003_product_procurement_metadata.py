"""add product procurement metadata

Revision ID: 0003_procurement_meta
Revises: 0002_product_taxonomy
Create Date: 2026-04-19

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_procurement_meta"
down_revision: Union[str, None] = "0002_product_taxonomy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("products", sa.Column("manufacturer", sa.String(length=255), nullable=True), schema="catalog")
    op.add_column("products", sa.Column("manufacturer_sku", sa.String(length=128), nullable=True), schema="catalog")
    op.add_column("products", sa.Column("ean", sa.String(length=64), nullable=True), schema="catalog")
    op.add_column("products", sa.Column("image_url", sa.String(length=512), nullable=True), schema="catalog")
    op.add_column("products", sa.Column("special_info", postgresql.JSONB(astext_type=sa.Text()), nullable=True), schema="catalog")
    op.add_column("products", sa.Column("source_delivery_days", sa.Numeric(precision=8, scale=2), nullable=True), schema="catalog")
    op.add_column("products", sa.Column("expected_delivery_days", sa.Numeric(precision=8, scale=2), nullable=True), schema="catalog")
    op.add_column("products", sa.Column("delivery_confidence", sa.Numeric(precision=4, scale=2), nullable=True), schema="catalog")
    op.add_column("products", sa.Column("must_order", sa.Boolean(), nullable=False, server_default=sa.text("false")), schema="catalog")
    op.add_column("products", sa.Column("base_discount_pct", sa.Numeric(precision=5, scale=2), nullable=False, server_default="0"), schema="catalog")
    op.add_column("products", sa.Column("bulk_discount_pct", sa.Numeric(precision=5, scale=2), nullable=False, server_default="0"), schema="catalog")
    op.add_column("products", sa.Column("bulk_discount_threshold", sa.Numeric(precision=12, scale=3), nullable=True), schema="catalog")


def downgrade() -> None:
    op.drop_column("products", "bulk_discount_threshold", schema="catalog")
    op.drop_column("products", "bulk_discount_pct", schema="catalog")
    op.drop_column("products", "base_discount_pct", schema="catalog")
    op.drop_column("products", "must_order", schema="catalog")
    op.drop_column("products", "delivery_confidence", schema="catalog")
    op.drop_column("products", "expected_delivery_days", schema="catalog")
    op.drop_column("products", "source_delivery_days", schema="catalog")
    op.drop_column("products", "special_info", schema="catalog")
    op.drop_column("products", "image_url", schema="catalog")
    op.drop_column("products", "ean", schema="catalog")
    op.drop_column("products", "manufacturer_sku", schema="catalog")
    op.drop_column("products", "manufacturer", schema="catalog")
