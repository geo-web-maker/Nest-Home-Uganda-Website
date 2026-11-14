"""Rename the legacy ``home.eggs`` site setting to ``home.arches``.

The egg logo and its vocabulary were retired. Editors may have customised the three homepage
cards, so the stored value is carried over rather than reset to defaults. Idempotent: safe to
re-run, and an already-created ``home.arches`` document is never overwritten.
"""
from pymongo.asynchronous.database import AsyncDatabase

OLD_KEY = "home.eggs"
NEW_KEY = "home.arches"


async def up(db: AsyncDatabase) -> None:
    settings = db["settings"]
    legacy = await settings.find_one({"key": OLD_KEY})
    if legacy is None:
        return
    if await settings.find_one({"key": NEW_KEY}) is None:
        await settings.update_one({"_id": legacy["_id"]}, {"$set": {"key": NEW_KEY}})
    else:
        await settings.delete_one({"_id": legacy["_id"]})
