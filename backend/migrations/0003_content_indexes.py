"""Indexes for the content collections added in S5 (spec 8.4). Idempotent.

The services module already has its own indexes in 0001. Uniqueness is enforced here, because
the services check for a taken slug or key alone cannot stop two requests racing.
"""

from pymongo import ASCENDING
from pymongo.asynchronous.database import AsyncDatabase


async def up(db: AsyncDatabase) -> None:
    await db["faqs"].create_index(
        [("service_id", ASCENDING), ("sort_order", ASCENDING)], name="service_sort_order"
    )
    await db["team_members"].create_index([("sort_order", ASCENDING)], name="sort_order")
    await db["areas"].create_index([("sort_order", ASCENDING)], name="sort_order")
    await db["testimonials"].create_index(
        [("approved", ASCENDING), ("created_at", ASCENDING)], name="approved_created"
    )
    await db["pricing_blocks"].create_index([("key", ASCENDING)], unique=True, name="key_unique")
    await db["articles"].create_index([("slug", ASCENDING)], unique=True, name="slug_unique")
    await db["pages"].create_index([("key", ASCENDING)], unique=True, name="key_unique")
    await db["media"].create_index([("created_at", ASCENDING)], name="created_at")
