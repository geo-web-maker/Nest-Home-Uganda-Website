"""Indexes for the applications collection (spec 8.4), introduced in S5.18."""

from pymongo import ASCENDING, DESCENDING
from pymongo.asynchronous.database import AsyncDatabase


async def up(db: AsyncDatabase) -> None:
    applications = db["applications"]
    await applications.create_index(
        [("job_id", ASCENDING), ("stage", ASCENDING)], name="job_stage"
    )
    await applications.create_index([("created_at", DESCENDING)], name="created_at_desc")
    await applications.create_index([("delete_after", ASCENDING)], name="delete_after")
