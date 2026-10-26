"""Run numbered migration scripts once each, tracked in the `migrations` collection.

    python -m app.migrate

Scripts live in backend/migrations as NNNN_name.py and define `async def up(db)`.
Each script must be idempotent. Running this twice changes nothing.
"""

import asyncio
import importlib.util
from datetime import UTC, datetime
from pathlib import Path

from pymongo.asynchronous.database import AsyncDatabase

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def discover(directory: Path = MIGRATIONS_DIR) -> list[Path]:
    return sorted(p for p in directory.glob("[0-9][0-9][0-9][0-9]_*.py"))


async def run_migrations(
    db: AsyncDatabase,
    directory: Path = MIGRATIONS_DIR,
    exclude: set[str] | None = None,
    only: set[str] | None = None,
) -> list[str]:
    """Return the names of the scripts that ran this time."""
    ran: list[str] = []
    done = {doc["_id"] async for doc in db["migrations"].find({}, {"_id": 1})}
    for path in discover(directory):
        if exclude and path.stem in exclude:
            continue
        if only is not None and path.stem not in only:
            continue
        if path.stem in done:
            continue
        spec = importlib.util.spec_from_file_location(f"migration_{path.stem}", path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"cannot load {path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        await module.up(db)
        await db["migrations"].insert_one({"_id": path.stem, "at": datetime.now(UTC)})
        ran.append(path.stem)
    return ran


async def _main() -> None:
    from pymongo import AsyncMongoClient

    from app.core.config import get_settings

    settings = get_settings()
    if not settings.mongodb_uri:
        raise SystemExit("MONGODB_URI is empty.")
    client = AsyncMongoClient(settings.mongodb_uri, tz_aware=True)
    care_client = (
        client
        if (settings.care_mongodb_uri or settings.mongodb_uri) == settings.mongodb_uri
        else AsyncMongoClient(settings.care_mongodb_uri, tz_aware=True)
    )
    care_names = {
        "0006_care_users",
        "0007_care_core",
        "0008_care_ops",
        "0010_care_client_consents",
        "0011_visit_sync_cursor",
        "0012_care_track_c",
    }
    try:
        main_ran = await run_migrations(client[settings.mongodb_db], exclude=care_names)
        care_ran = await run_migrations(care_client[settings.care_mongodb_db], only=care_names)
        print("main ran:", ", ".join(main_ran) if main_ran else "nothing to do")  # noqa: T201
        print("care ran:", ", ".join(care_ran) if care_ran else "nothing to do")  # noqa: T201
    finally:
        if care_client is not client:
            await care_client.close()
        await client.close()


if __name__ == "__main__":
    asyncio.run(_main())
