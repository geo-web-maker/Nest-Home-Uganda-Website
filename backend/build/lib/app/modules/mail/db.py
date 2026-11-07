"""Postgres connection and numbered, idempotent mail migrations.

The primary application remains on MongoDB/Beanie. Mail owns an independent pool so a
mail database outage cannot silently redirect or contaminate the primary data store.
"""

from __future__ import annotations

import asyncio
import importlib
import logging
import sys
from pathlib import Path
from typing import Any

from app.core.errors import AppError

log = logging.getLogger("app.mail.db")
_SOURCE_MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "mail_migrations"
_MIGRATION_DIR_CANDIDATES = (
    _SOURCE_MIGRATIONS_DIR,
    Path(sys.prefix) / "mail_migrations",
    Path.cwd() / "mail_migrations",
    Path.cwd() / "backend" / "mail_migrations",
)
MIGRATIONS_DIR = next(
    (candidate for candidate in _MIGRATION_DIR_CANDIDATES if candidate.is_dir()),
    _SOURCE_MIGRATIONS_DIR,
)
_ADVISORY_LOCK_ID = 0x4E455354  # ASCII-ish "NEST", stable across app instances.
_pool: Any | None = None
_pool_lock = asyncio.Lock()
_health_task: asyncio.Task[None] | None = None


class MailDatabaseUnavailable(AppError):
    def __init__(self) -> None:
        super().__init__(
            "mail_database_unavailable",
            "The mail database is not configured or is temporarily unavailable.",
            503,
        )


async def run_migrations(pool: Any, migrations_dir: Path = MIGRATIONS_DIR) -> list[str]:
    """Apply pending SQL migrations atomically and in filename order.

    The transaction-scoped advisory lock is compatible with Neon pooled URLs, which may
    route connections through PgBouncer transaction pooling.
    """
    migration_files = sorted(migrations_dir.glob("*.sql"))
    if not migration_files:
        raise RuntimeError(f"No mail SQL migrations found in {migrations_dir}.")
    applied: list[str] = []
    async with pool.acquire() as connection:
        async with connection.transaction():
            await connection.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations "
                "(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
            )
            await connection.execute(
                "SELECT pg_advisory_xact_lock($1)", _ADVISORY_LOCK_ID
            )
            rows = await connection.fetch("SELECT name FROM schema_migrations")
            completed = {row["name"] for row in rows}
            for migration in migration_files:
                if migration.name in completed:
                    continue
                sql = migration.read_text(encoding="utf-8")
                await connection.execute(sql)
                await connection.execute(
                    "INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING",
                    migration.name,
                )
                applied.append(migration.name)
    return applied


async def connect(database_url: str) -> None:
    """Create the dedicated asyncpg pool and bring its schema up to date."""
    global _pool
    if not database_url.strip():
        return
    async with _pool_lock:
        if _pool is not None:
            return
        pool: Any | None = None
        try:
            asyncpg = importlib.import_module("asyncpg")
            pool = await asyncpg.create_pool(
                dsn=database_url,
                min_size=1,
                max_size=10,
                command_timeout=30,
                statement_cache_size=0,
                server_settings={"application_name": "nest-home-care-mail"},
            )
            await run_migrations(pool)
        except Exception:
            if pool is not None:
                try:
                    await pool.close()
                except Exception:
                    log.error("mail database pool cleanup failed; details omitted")
            log.error("mail database startup or migration failed; details omitted")
            raise
        if pool is None:
            raise MailDatabaseUnavailable()
        _pool = pool


async def close() -> None:
    global _health_task, _pool
    task, _health_task = _health_task, None
    if task is not None and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    async with _pool_lock:
        pool, _pool = _pool, None
        if pool is not None:
            await pool.close()


def get_pool() -> Any:
    if _pool is None:
        raise MailDatabaseUnavailable()
    return _pool


async def ping() -> bool:
    """Probe the mail database without exposing connection details."""
    pool = get_pool()
    async with pool.acquire() as connection:
        return await connection.fetchval("SELECT 1") == 1


async def health_hook(database_url: str = "") -> None:
    """Schedule one non-blocking mail DB connect/probe from /health.

    A transient Neon outage must not take the Mongo-backed application offline while
    mail is disabled. The health ping retries connection and migrations in the background.
    The outbox drain is opportunistic and remains non-blocking.
    """
    global _health_task
    if _pool is None and not database_url.strip():
        return
    if _health_task is not None and not _health_task.done():
        return

    async def check() -> None:
        try:
            if _pool is None:
                await connect(database_url)
            await ping()
            try:
                from app.modules.mail.outbox import drain
                await drain(limit=5)
            except Exception:
                log.warning("mail opportunistic outbox drain failed; details omitted")
        except Exception:
            log.warning("mail database health probe/reconnect failed; details omitted")

    _health_task = asyncio.create_task(check(), name="mail-health-probe")
