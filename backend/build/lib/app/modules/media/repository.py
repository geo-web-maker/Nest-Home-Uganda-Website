"""Media metadata queries."""

import re

from beanie import PydanticObjectId

from app.core.pagination import PageParams
from app.modules.media.models import Media


async def get(media_id: str) -> Media | None:
    if not PydanticObjectId.is_valid(media_id):
        return None
    return await Media.find_one({"_id": PydanticObjectId(media_id), "deleted_at": None})


async def list_admin(page: PageParams, q: str | None) -> tuple[list[Media], int]:
    query: dict = {"deleted_at": None}
    if q and q.strip():
        query["storage_key"] = {"$regex": re.escape(q.strip()), "$options": "i"}
    finder = Media.find(query)
    total = await finder.count()
    items = await finder.sort("-created_at").skip(page.skip).limit(page.page_size).to_list()
    return items, total
