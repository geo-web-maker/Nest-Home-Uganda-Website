"""Indexes for short-lived one-time cross-app handoff codes."""
from pymongo import ASCENDING


async def up(db) -> None:
    collection = db["app_handoffs"]
    await collection.create_index(
        [("code_hash", ASCENDING)], unique=True, name="uq_app_handoffs_code_hash"
    )
    await collection.create_index(
        [("expires_at", ASCENDING)], expireAfterSeconds=0, name="ttl_app_handoffs_expires_at"
    )


async def down(db) -> None:
    collection = db["app_handoffs"]
    await collection.drop_index("uq_app_handoffs_code_hash")
    await collection.drop_index("ttl_app_handoffs_expires_at")
