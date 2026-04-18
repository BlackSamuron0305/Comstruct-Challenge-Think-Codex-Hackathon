from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from src.config import get_settings
from src.db import Base
from src.models import (  # noqa: F401  - register metadata
    ApprovalRule,
    AuditLog,
    Company,
    Order,
    OrderItem,
    Project,
    User,
)

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", get_settings().SYNC_DATABASE_URL)

target_metadata = Base.metadata
MANAGED_SCHEMAS = {"orders", "auth", "audit"}


def include_object(obj, name, type_, reflected, compare_to):
    if type_ == "table" and getattr(obj, "schema", None) not in MANAGED_SCHEMAS:
        return False
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        include_schemas=True,
        include_object=include_object,
        version_table_schema="orders",
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=True,
            include_object=include_object,
            version_table_schema="orders",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
