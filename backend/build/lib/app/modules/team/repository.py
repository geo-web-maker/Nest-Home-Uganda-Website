"""Queries for team members. Soft-deleted documents are excluded."""

import re

from beanie import PydanticObjectId

from app.core.pagination import PageParams
from app.modules.team.models import TeamMember

_LIVE = {"deleted_at": None}


async def get(member_id: str) -> TeamMember | None:
    if not PydanticObjectId.is_valid(member_id):
        return None
    return await TeamMember.find_one({"_id": PydanticObjectId(member_id), **_LIVE})


async def list_admin(
    page: PageParams,
    q: str | None,
    published: bool | None,
) -> tuple[list[TeamMember], int]:
    query: dict = dict(_LIVE)

    if q and q.strip():
        query["name"] = {
            "$regex": "^" + re.escape(q.strip()),
            "$options": "i",
        }

    if published is not None:
        query["published"] = published

    finder = TeamMember.find(query)
    total = await finder.count()
    items = await finder.sort("sort_order", "name").skip(page.skip).limit(page.page_size).to_list()
    return items, total


async def list_published() -> list[TeamMember]:
    return await TeamMember.find({"published": True, **_LIVE}).sort("sort_order", "name").to_list()
