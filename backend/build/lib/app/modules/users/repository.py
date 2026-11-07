"""Queries only."""

import re
from datetime import datetime

from beanie import PydanticObjectId

from app.core.pagination import PageParams
from app.modules.auth.models import PasswordReset, User


async def list_users(page: PageParams, q: str | None) -> tuple[list[User], int]:
    query: dict = {}
    if q and q.strip():
        term = re.escape(q.strip())
        query["$or"] = [
            {"name": {"$regex": f"^{term}", "$options": "i"}},
            {"email": {"$regex": f"^{term}", "$options": "i"}},
        ]
    finder = User.find(query)
    total = await finder.count()
    items = await finder.sort("name", "_id").skip(page.skip).limit(page.page_size).to_list()
    return items, total


async def invalidate_open_links(user_id: PydanticObjectId, now: datetime) -> None:
    await PasswordReset.get_pymongo_collection().update_many(
        {"user_id": user_id, "used_at": None}, {"$set": {"used_at": now}}
    )


async def reset_by_hash(token_hash: str) -> PasswordReset | None:
    return await PasswordReset.find_one(PasswordReset.token_hash == token_hash)


async def claim_reset(reset_id: PydanticObjectId, now: datetime) -> bool:
    """True for exactly one caller: a link works once."""
    result = await PasswordReset.get_pymongo_collection().update_one(
        {"_id": reset_id, "used_at": None}, {"$set": {"used_at": now}}
    )
    return result.modified_count == 1
