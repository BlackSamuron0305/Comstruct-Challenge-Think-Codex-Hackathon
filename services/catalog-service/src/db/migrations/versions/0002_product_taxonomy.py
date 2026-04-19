"""add product taxonomy fields

Revision ID: 0002_product_taxonomy
Revises: 0001_initial
Create Date: 2026-04-19
"""

from alembic import op
import sqlalchemy as sa


revision = "0002_product_taxonomy"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("taxonomy_code", sa.String(length=96), nullable=True), schema="catalog")
    op.add_column("products", sa.Column("taxonomy_label", sa.String(length=255), nullable=True), schema="catalog")
    op.create_index("ix_products_taxonomy_code", "products", ["taxonomy_code"], unique=False, schema="catalog")


def downgrade() -> None:
    op.drop_index("ix_products_taxonomy_code", table_name="products", schema="catalog")
    op.drop_column("products", "taxonomy_label", schema="catalog")
    op.drop_column("products", "taxonomy_code", schema="catalog")
