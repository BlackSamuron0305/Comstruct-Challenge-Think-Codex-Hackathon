"""add risk_signals JSONB column to orders

Revision ID: 0003_risk_signals
Revises: 0002_4nf_normalize
Create Date: 2026-04-19

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_risk_signals"
down_revision: Union[str, None] = "0002_4nf_normalize"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("risk_signals", postgresql.JSONB(), nullable=True),
        schema="orders",
    )


def downgrade() -> None:
    op.drop_column("orders", "risk_signals", schema="orders")
