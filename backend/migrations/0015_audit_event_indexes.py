"""Indexes for structured audit events and user-facing audit history."""
from pymongo import ASCENDING, DESCENDING
from pymongo.asynchronous.database import AsyncDatabase


async def up(db: AsyncDatabase) -> None:
    await db["audit_log"].create_index(
        [("event_type", ASCENDING), ("at", DESCENDING)], name="event_type_at"
    )
    await db["audit_log"].create_index(
        [("severity", ASCENDING), ("at", DESCENDING)], name="severity_at"
    )
    await db["audit_log"].create_index(
        [("source", ASCENDING), ("at", DESCENDING)], name="source_at"
    )
    await db["audit_log"].create_index(
        [("request_id", ASCENDING)], sparse=True, name="request_id_sparse"
    )
