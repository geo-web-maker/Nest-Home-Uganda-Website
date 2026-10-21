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


async def run_migrations(db: AsyncDatabase, directory: Path = MIGRATIONS_DIR) -> list[str]:
    """Return the names of the scripts that ran this time."""
    ran: list[str] = []
    done = {doc["_id"] async for doc in db["migrations"].find({}, {"_id": 1})}
    for path in discover(directory):
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
    try:
        ran = await run_migrations(client[settings.mongodb_db])
        print("ran:", ", ".join(ran) if ran else "nothing to do")  # noqa: T201
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(_main())
