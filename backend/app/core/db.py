"""MongoDB connection and Beanie setup (Beanie 2 on PyMongo async, no Motor).

Indexes are NOT created here. They are created by migration scripts (spec 8.4).
"""

from beanie import Document, init_beanie
from pymongo import AsyncMongoClient

_client: AsyncMongoClient | None = None
_db_name = ""


async def connect(uri: str, db_name: str, models: list[type[Document]]) -> None:
    global _client, _db_name
    _db_name = db_name
    _client = AsyncMongoClient(uri, tz_aware=True, serverSelectionTimeoutMS=5000)
    await init_beanie(database=_client[db_name], document_models=models, skip_indexes=True)


async def disconnect() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None


def get_database():
    if _client is None:
        raise RuntimeError("Database is not connected.")
    return _client[_db_name]


async def ping() -> bool:
    if _client is None:
        return False
    try:
        await _client.admin.command("ping")
    except Exception:
        return False
    return True
