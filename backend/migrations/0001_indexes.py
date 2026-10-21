"""Indexes for the collections that exist so far (spec 8.4). Idempotent.

Later modules add their own numbered scripts. Indexes are never created at request time.
"""

from pymongo import ASCENDING, DESCENDING
from pymongo.asynchronous.database import AsyncDatabase

DAY = 86400


async def up(db: AsyncDatabase) -> None:
    await db["users"].create_index([("email", ASCENDING)], unique=True, name="email_unique")
    await db["refresh_tokens"].create_index(
        [("expires_at", ASCENDING)], expireAfterSeconds=0, name="expires_ttl"
    )
    await db["refresh_tokens"].create_index([("token_hash", ASCENDING)], unique=True, name="hash")
    await db["refresh_tokens"].create_index([("user_id", ASCENDING)], name="user")
    await db["password_resets"].create_index(
        [("expires_at", ASCENDING)], expireAfterSeconds=0, name="expires_ttl"
    )
    await db["password_resets"].create_index([("token_hash", ASCENDING)], unique=True, name="hash")
    await db["services"].create_index([("slug", ASCENDING)], unique=True, name="slug_unique")
    await db["services"].create_index([("sort_order", ASCENDING)], name="sort_order")
    await db["audit_log"].create_index(
        [("at", ASCENDING)], expireAfterSeconds=730 * DAY, name="at_ttl_24_months"
    )
    await db["audit_log"].create_index([("user_id", ASCENDING), ("at", DESCENDING)], name="user_at")
    await db["content_versions"].create_index(
        [("item_type", ASCENDING), ("item_id", ASCENDING), ("at", DESCENDING)], name="item_at"
    )
