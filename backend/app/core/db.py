"""MongoDB setup for the public site database and the separate care database."""

import inspect

from beanie import Document, init_beanie
from pymongo import AsyncMongoClient
from pymongo.asynchronous.client_session import AsyncClientSession

_client: AsyncMongoClient | None = None
_care_client: AsyncMongoClient | None = None
_db_name = ""
_care_db_name = ""


async def connect(
    uri: str,
    db_name: str,
    models: list[type[Document]],
    *,
    care_uri: str | None = None,
    care_db_name: str | None = None,
    care_models: list[type[Document]] | None = None,
) -> None:
    global _client, _care_client, _db_name, _care_db_name
    _db_name = db_name
    _client = AsyncMongoClient(uri, tz_aware=True, serverSelectionTimeoutMS=5000)
    await init_beanie(database=_client[db_name], document_models=models, skip_indexes=True)
    if care_models:
        effective_care_uri = care_uri or uri
        _care_db_name = care_db_name or f"{db_name}_care"
        _care_client = (
            _client
            if effective_care_uri == uri
            else AsyncMongoClient(effective_care_uri, tz_aware=True, serverSelectionTimeoutMS=5000)
        )
        if _care_db_name == db_name and _care_client is _client:
            raise ValueError("Care collections must use a separate database from the public site.")
        await init_beanie(
            database=_care_client[_care_db_name], document_models=care_models, skip_indexes=True
        )


async def disconnect() -> None:
    global _client, _care_client
    if _care_client is not None and _care_client is not _client:
        await _care_client.close()
    if _client is not None:
        await _client.close()
    _client = None
    _care_client = None


def get_database():
    if _client is None:
        raise RuntimeError("Database is not connected.")
    return _client[_db_name]


def get_care_database():
    if _care_client is None:
        raise RuntimeError("Care database is not connected.")
    return _care_client[_care_db_name]


async def ping() -> bool:
    if _client is None:
        return False
    try:
        await _client.admin.command("ping")
    except Exception:
        return False
    return True


async def ping_care() -> bool:
    if _care_client is None:
        return False
    try:
        await _care_client.admin.command("ping")
    except Exception:
        return False
    return True


async def start_session(database) -> AsyncClientSession:
    """Start a client session for a transaction on the database's client.

    PyMongo's async ``start_session`` returns the session directly in current releases,
    but earlier async releases returned a coroutine. Accept both so callers can write
    ``async with await start_session(db) as session``.
    """
    started = database.client.start_session()
    if inspect.isawaitable(started):
        started = await started
    return started
