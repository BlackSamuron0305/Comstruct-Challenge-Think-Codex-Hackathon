"""4NF normalization: supplier_scores, price_history, worker_profiles, supplier_reviews

Revision ID: 0002_4nf_normalize
Revises: 0001_initial
Create Date: 2026-04-18

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_4nf_normalize"
down_revision: str = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Worker profiles (role, trade, glove_size, language preference) ──
    op.create_table(
        "worker_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("auth.users.id", ondelete="CASCADE"),
                  nullable=False, unique=True),
        sa.Column("trade", sa.String(64)),  # e.g. "electrician", "carpenter", "steel_fitter"
        sa.Column("certifications", postgresql.ARRAY(sa.String), server_default="{}"),
        sa.Column("preferred_language", sa.String(8), server_default="'de'"),
        sa.Column("glove_size", sa.String(8)),  # S, M, L, XL — for UI adaptation
        sa.Column("site_id", postgresql.UUID(as_uuid=True)),  # current project site
        sa.Column("device_token", sa.String(512)),  # FCM / APNS push token
        sa.Column("offline_model_version", sa.String(32)),  # local Gemma model version
        sa.Column("last_sync_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema="auth",
    )
    op.create_index("ix_worker_profiles_user_id", "worker_profiles", ["user_id"], schema="auth")
    op.create_index("ix_worker_profiles_trade", "worker_profiles", ["trade"], schema="auth")

    # ── Supplier scores (4NF: separate from supplier entity) ──────────
    op.execute("CREATE SCHEMA IF NOT EXISTS procurement")
    op.create_table(
        "supplier_scores",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("supplier_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("score_type", sa.String(32), nullable=False),  # price, delivery, trust, overall
        sa.Column("score_value", sa.Numeric(5, 2), nullable=False),  # 0.00 – 100.00
        sa.Column("confidence", sa.Numeric(3, 2)),  # 0.00 – 1.00
        sa.Column("sample_size", sa.Integer, server_default="0"),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("metadata", postgresql.JSONB, server_default="{}"),
        schema="procurement",
    )
    op.create_index("ix_supplier_scores_supplier", "supplier_scores",
                    ["supplier_id", "score_type"], schema="procurement")
    op.create_index("ix_supplier_scores_type", "supplier_scores",
                    ["score_type", "score_value"], schema="procurement")

    # ── Price history (4NF: multi-valued dependency separated) ────────
    op.create_table(
        "price_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("supplier_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="'CHF'"),
        sa.Column("source", sa.String(32), nullable=False, server_default="'manual'"),
        sa.Column("scraped_url", sa.Text),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema="procurement",
    )
    op.create_index("ix_price_history_product", "price_history",
                    ["product_id", "recorded_at"], schema="procurement")
    op.create_index("ix_price_history_supplier", "price_history",
                    ["supplier_id", "recorded_at"], schema="procurement")

    # ── Supplier reviews (new company interactions tracking) ──────────
    op.create_table(
        "supplier_interactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("supplier_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("interaction_type", sa.String(32), nullable=False),  # order, review, dispute
        sa.Column("order_id", postgresql.UUID(as_uuid=True)),
        sa.Column("rating", sa.SmallInteger),  # 1-5
        sa.Column("notes", sa.Text),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True)),
        sa.Column("is_first_interaction", sa.Boolean, server_default=sa.text("false")),
        sa.Column("requires_approval", sa.Boolean, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema="procurement",
    )
    op.create_index("ix_supplier_interactions_company", "supplier_interactions",
                    ["company_id", "supplier_id"], schema="procurement")

    # ── Approved suppliers (whitelist per company) ────────────────────
    op.create_table(
        "approved_suppliers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("supplier_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("notes", sa.Text),
        schema="procurement",
    )
    op.create_unique_constraint(
        "uq_approved_suppliers_company_supplier",
        "approved_suppliers", ["company_id", "supplier_id"],
        schema="procurement",
    )

    # ── Scrape jobs (track daily price scraping) ──────────────────────
    op.create_table(
        "scrape_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("supplier_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="'pending'"),
        sa.Column("products_updated", sa.Integer, server_default="0"),
        sa.Column("errors", postgresql.JSONB, server_default="[]"),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema="procurement",
    )

    # ── Offline sync queue (for mobile workers without wifi) ──────────
    op.create_table(
        "sync_queue",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("payload", postgresql.JSONB, nullable=False),
        sa.Column("synced", sa.Boolean, server_default=sa.text("false")),
        sa.Column("synced_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema="orders",
    )
    op.create_index("ix_sync_queue_user_synced", "sync_queue",
                    ["user_id", "synced"], schema="orders")


def downgrade() -> None:
    op.drop_index("ix_sync_queue_user_synced", table_name="sync_queue", schema="orders")
    op.drop_table("sync_queue", schema="orders")
    op.drop_table("scrape_jobs", schema="procurement")
    op.drop_table("approved_suppliers", schema="procurement")
    op.drop_index("ix_supplier_interactions_company", table_name="supplier_interactions", schema="procurement")
    op.drop_table("supplier_interactions", schema="procurement")
    op.drop_index("ix_price_history_supplier", table_name="price_history", schema="procurement")
    op.drop_index("ix_price_history_product", table_name="price_history", schema="procurement")
    op.drop_table("price_history", schema="procurement")
    op.drop_index("ix_supplier_scores_type", table_name="supplier_scores", schema="procurement")
    op.drop_index("ix_supplier_scores_supplier", table_name="supplier_scores", schema="procurement")
    op.drop_table("supplier_scores", schema="procurement")
    op.drop_index("ix_worker_profiles_trade", table_name="worker_profiles", schema="auth")
    op.drop_index("ix_worker_profiles_user_id", table_name="worker_profiles", schema="auth")
    op.drop_table("worker_profiles", schema="auth")
    op.execute("DROP SCHEMA IF EXISTS procurement CASCADE")
