"""initial order + auth + audit schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-04-18

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS auth")
    op.execute("CREATE SCHEMA IF NOT EXISTS orders")
    op.execute("CREATE SCHEMA IF NOT EXISTS audit")

    # auth.companies
    op.create_table(
        "companies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema="auth",
    )

    # auth.users
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("auth.companies.id"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("phone", sa.String(64)),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema="auth",
    )

    # orders.projects
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("site_address", sa.Text),
        sa.Column("trade", sa.String(64)),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema="orders",
    )

    # orders.approval_rules
    op.create_table(
        "approval_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("threshold_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("auto_approve_below", sa.Boolean, server_default=sa.text("true")),
        sa.Column("restricted_categories", postgresql.ARRAY(sa.String),
                  server_default="{}", nullable=False),
        sa.Column("approver_role", sa.String(32), server_default="project_manager"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema="orders",
    )

    # orders.orders
    op.create_table(
        "orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("foreman_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="CHF"),
        sa.Column("requires_approval", sa.Boolean, server_default=sa.text("false")),
        sa.Column("approver_id", postgresql.UUID(as_uuid=True)),
        sa.Column("rejection_reason", sa.Text),
        sa.Column("supplier_order_ref", sa.String(128)),
        sa.Column("requested_delivery", sa.DateTime(timezone=True)),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema="orders",
    )
    op.create_index("ix_orders_status", "orders", ["status"], schema="orders")
    op.create_index("ix_orders_company_status", "orders",
                    ["company_id", "status"], schema="orders")
    op.create_index("ix_orders_foreman", "orders", ["foreman_id"], schema="orders")

    # orders.order_items
    op.create_table(
        "order_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("order_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("orders.orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_snapshot", postgresql.JSONB, nullable=False),
        sa.Column("quantity", sa.Numeric(12, 3), nullable=False),
        sa.Column("unit", sa.String(16), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("line_total", sa.Numeric(12, 2), nullable=False),
        schema="orders",
    )

    # audit.audit_log
    op.create_table(
        "audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True)),
        sa.Column("actor_role", sa.String(32)),
        sa.Column("actor_ip", sa.String(64)),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("entity_type", sa.String(32), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("payload", postgresql.JSONB, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema="audit",
    )
    op.create_index("ix_audit_entity", "audit_log",
                    ["entity_type", "entity_id"], schema="audit")
    op.create_index("ix_audit_created", "audit_log", ["created_at"], schema="audit")


def downgrade() -> None:
    op.drop_index("ix_audit_created", table_name="audit_log", schema="audit")
    op.drop_index("ix_audit_entity", table_name="audit_log", schema="audit")
    op.drop_table("audit_log", schema="audit")
    op.drop_table("order_items", schema="orders")
    op.drop_index("ix_orders_foreman", table_name="orders", schema="orders")
    op.drop_index("ix_orders_company_status", table_name="orders", schema="orders")
    op.drop_index("ix_orders_status", table_name="orders", schema="orders")
    op.drop_table("orders", schema="orders")
    op.drop_table("approval_rules", schema="orders")
    op.drop_table("projects", schema="orders")
    op.drop_table("users", schema="auth")
    op.drop_table("companies", schema="auth")
