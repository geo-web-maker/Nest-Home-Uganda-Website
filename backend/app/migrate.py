"""Run numbered MongoDB migrations once each, safely across app instances.

    python -m app.migrate

Scripts live in backend/migrations as NNNN_name.py and define ``async def up(db)``.
Each script must be idempotent. Migration history is stored in the ``migrations``
collection and a distributed lease prevents two deploying instances from running
schema changes concurrently.
"""

from __future__ import annotations

import asyncio
import importlib.util
import logging
import time
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"
_LOCK_COLLECTION = "_schema_migration_locks"
_LOCK_ID = "mongo-schema-migrations"
_LOCK_LEASE = timedelta(minutes=5)
_LOCK_WAIT_SECONDS = 600
log = logging.getLogger("app.migrations")


def discover(directory: Path = MIGRATIONS_DIR) -> list[Path]:
    return sorted(p for p in directory.glob("[0-9][0-9][0-9][0-9]_*.py"))


async def _acquire_lock(db: AsyncDatabase) -> str:
    """Acquire a renewable deployment lock shared by all app instances."""
    locks = db[_LOCK_COLLECTION]
    owner = uuid.uuid4().hex
    deadline = time.monotonic() + _LOCK_WAIT_SECONDS

    while True:
        now = datetime.now(UTC)
        try:
            lock = await locks.find_one_and_update(
                {
                    "_id": _LOCK_ID,
                    "$or": [
                        {"expires_at": {"$lte": now}},
                        {"owner": owner},
                    ],
                },
                {"$set": {"owner": owner, "expires_at": now + _LOCK_LEASE}},
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )
        except DuplicateKeyError:
            # Another instance owns the existing _id; the upsert path races by design.
            lock = None

        if lock and lock.get("owner") == owner:
            return owner
        if time.monotonic() >= deadline:
            raise TimeoutError(
                "Timed out waiting for another application instance to finish MongoDB migrations."
            )
        await asyncio.sleep(0.5)


async def _refresh_lock(db: AsyncDatabase, owner: str) -> None:
    result = await db[_LOCK_COLLECTION].update_one(
        {"_id": _LOCK_ID, "owner": owner},
        {"$set": {"expires_at": datetime.now(UTC) + _LOCK_LEASE}},
    )
    if result.matched_count != 1:
        raise RuntimeError("MongoDB migration lock was lost while migrations were running.")


async def _heartbeat_lock(db: AsyncDatabase, owner: str) -> None:
    while True:
        await asyncio.sleep(60)
        await _refresh_lock(db, owner)


async def run_migrations(
    db: AsyncDatabase,
    directory: Path = MIGRATIONS_DIR,
    exclude: set[str] | None = None,
    only: set[str] | None = None,
) -> list[str]:
    """Return the migration names applied by this invocation.

    Migrations run while holding a database-level lock, so rolling deployments with
    multiple replicas cannot execute the same migration at the same time.
    """
    owner = await _acquire_lock(db)
    heartbeat = asyncio.create_task(_heartbeat_lock(db, owner))
    ran: list[str] = []
    try:
        done = {doc["_id"] async for doc in db["migrations"].find({}, {"_id": 1})}
        for path in discover(directory):
            if exclude and path.stem in exclude:
                continue
            if only is not None and path.stem not in only:
                continue
            if path.stem in done:
                continue

            await _refresh_lock(db, owner)
            spec = importlib.util.spec_from_file_location(f"migration_{path.stem}", path)
            if spec is None or spec.loader is None:
                raise RuntimeError(f"Cannot load MongoDB migration {path.name}.")
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            log.info("Applying MongoDB migration %s", path.stem)
            await module.up(db)
            await db["migrations"].insert_one({"_id": path.stem, "at": datetime.now(UTC)})
            ran.append(path.stem)
        return ran
    finally:
        heartbeat.cancel()
        await asyncio.gather(heartbeat, return_exceptions=True)
        await db[_LOCK_COLLECTION].delete_one({"_id": _LOCK_ID, "owner": owner})


async def run_mongo_migrations(settings: Any | None = None) -> tuple[list[str], list[str]]:
    """Apply main-site and care Mongo migrations using the configured databases."""
    if settings is None:
        from app.core.config import get_settings

        settings = get_settings()
    if not settings.mongodb_uri:
        raise SystemExit("MONGODB_URI is empty; MongoDB migrations cannot run.")

    from pymongo import AsyncMongoClient

    if not MIGRATIONS_DIR.is_dir() or not discover(MIGRATIONS_DIR):
        raise RuntimeError(f"MongoDB migration directory is missing or empty: {MIGRATIONS_DIR}")

    care_uri = settings.care_mongodb_uri or settings.mongodb_uri
    care_db_name = settings.care_mongodb_db or f"{settings.mongodb_db}_care"
    shares_main_client = care_uri == settings.mongodb_uri
    if shares_main_client and care_db_name == settings.mongodb_db:
        raise ValueError("Care collections must use a separate database from the public site.")

    client = AsyncMongoClient(
        settings.mongodb_uri,
        tz_aware=True,
        serverSelectionTimeoutMS=10_000,
        connectTimeoutMS=10_000,
    )
    care_client = (
        client
        if shares_main_client
        else AsyncMongoClient(
            care_uri,
            tz_aware=True,
            serverSelectionTimeoutMS=10_000,
            connectTimeoutMS=10_000,
        )
    )
    care_names = {
        "0006_care_users",
        "0007_care_core",
        "0008_care_ops",
        "0010_care_client_consents",
        "0011_visit_sync_cursor",
        "0012_care_track_c",
        "0013_partial_id_indexes",
    }
    try:
        main_ran = await run_migrations(client[settings.mongodb_db], exclude=care_names)
        care_ran = await run_migrations(care_client[care_db_name], only=care_names)
        return main_ran, care_ran
    finally:
        if care_client is not client:
            await care_client.close()
        await client.close()


async def _main() -> None:
    from app.core.config import get_settings
    from app.modules.mail import db as mail_db

    settings = get_settings()
    main_ran, care_ran = await run_mongo_migrations(settings)
    print("main ran:", ", ".join(main_ran) if main_ran else "nothing to do")  # noqa: T201
    print("care ran:", ", ".join(care_ran) if care_ran else "nothing to do")  # noqa: T201

    if settings.nest_pg_url:
        try:
            await mail_db.connect(settings.nest_pg_url)
            print("mail ran: migrations applied or schema current")  # noqa: T201
        finally:
            await mail_db.close()
    else:
        print("mail ran: skipped (NEST_PG_URL is not configured)")  # noqa: T201


if __name__ == "__main__":
    asyncio.run(_main())
