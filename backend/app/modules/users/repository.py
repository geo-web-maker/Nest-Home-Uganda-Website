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


async def invalidate_open_links(
    user_id: PydanticObjectId, now: datetime, purposes: tuple[str, ...] | None = None
) -> None:
    """Withdraw open links (they will say "replaced by a newer one"). All kinds unless limited."""
    query: dict = {"user_id": user_id, "used_at": None}
    if purposes is not None:
        query["purpose"] = {"$in": list(purposes)}
    await PasswordReset.get_pymongo_collection().update_many(
        query, {"$set": {"used_at": now, "superseded_at": now}}
    )


async def trim_open_invites(user_id: PydanticObjectId, now: datetime, keep: int) -> None:
    """Keep only the newest `keep` open invite links; older ones are marked replaced."""
    rows = (
        await PasswordReset.find({"user_id": user_id, "used_at": None, "purpose": "invite"})
        .sort("-created_at")
        .skip(keep)
        .to_list()
    )
    if rows:
        await PasswordReset.get_pymongo_collection().update_many(
            {"_id": {"$in": [r.id for r in rows]}},
            {"$set": {"used_at": now, "superseded_at": now}},
        )


async def close_open_links(user_id: PydanticObjectId, now: datetime) -> None:
    """After a password is set, any other open link for the person is simply used up."""
    await PasswordReset.get_pymongo_collection().update_many(
        {"user_id": user_id, "used_at": None}, {"$set": {"used_at": now}}
    )


async def release_reset(reset_id: PydanticObjectId) -> None:
    """Give a link back when saving the password failed, so the person can try again."""
    await PasswordReset.get_pymongo_collection().update_one(
        {"_id": reset_id}, {"$set": {"used_at": None}}
    )


async def reset_by_hash(token_hash: str) -> PasswordReset | None:
    return await PasswordReset.find_one(PasswordReset.token_hash == token_hash)


async def claim_reset(reset_id: PydanticObjectId, now: datetime) -> bool:
    """True for exactly one caller: a link works once."""
    result = await PasswordReset.get_pymongo_collection().update_one(
        {"_id": reset_id, "used_at": None}, {"$set": {"used_at": now}}
    )
    return result.modified_count == 1
