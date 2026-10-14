import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context
from src.core.config import settings
from src.core.database import Base

# Import all models to register them on Base.metadata
from src.modules.auth.models import User, APIKey # noqa
from src.modules.projects.models import Project # noqa
from src.modules.recordings.models import Recording # noqa
from src.modules.test_generation.models import GeneratedTest # noqa
from src.modules.test_runner.models import TestRun # noqa
from src.modules.healing.models import HealedSelector # noqa

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_string is not None:
    fileConfig(config.config_file_string)

target_metadata = Base.metadata

def do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()

async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_section_name, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()

def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())

if context.is_offline_mode():
    context.configure(url=settings.DATABASE_URL, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()
else:
    run_migrations_online()
