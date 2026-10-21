"""Indexes for the jobs and settings collections introduced in S5.17 and S5.19."""

from pymongo import ASCENDING, DESCENDING
from pymongo.asynchronous.database import AsyncDatabase


async def up(db: AsyncDatabase) -> None:
    await db["settings"].create_index([("key", ASCENDING)], unique=True, name="key_unique")
    await db["jobs"].create_index(
        [("published", ASCENDING), ("closes_on", ASCENDING)], name="published_closes_on"
    )
    await db["jobs"].create_index([("created_at", DESCENDING)], name="created_at_desc")
    await db["jobs"].create_index(
        [("deleted_at", ASCENDING), ("closed_at", ASCENDING)], name="deleted_closed"
    )
