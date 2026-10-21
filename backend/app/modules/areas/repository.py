"""Database queries for content documents."""

import re

from beanie import PydanticObjectId

from app.core.pagination import PageParams
from app.modules.areas.models import Area

_LIVE = {"deleted_at": None}


async def get(item_id: str) -> Area | None:
    if not PydanticObjectId.is_valid(item_id):
        return None
    return await Area.find_one({"_id": PydanticObjectId(item_id), **_LIVE})


async def list_admin(
    page: PageParams, q: str | None, active: bool | None
) -> tuple[list[Area], int]:
    query: dict = dict(_LIVE)
    if q and q.strip():
        query["name"] = {"$regex": "^" + re.escape(q.strip()), "$options": "i"}
    # Areas do not have a published field in the data model.
    _ = active
    finder = Area.find(query)
    total = await finder.count()
    items = await finder.sort("sort_order", "name").skip(page.skip).limit(page.page_size).to_list()
    return items, total


async def list_public() -> list[Area]:
    return await Area.find(_LIVE).sort("sort_order", "name").to_list()
