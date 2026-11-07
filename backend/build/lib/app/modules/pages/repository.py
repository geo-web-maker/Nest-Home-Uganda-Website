"""Database queries for content documents."""

import re

from beanie import PydanticObjectId

from app.core.pagination import PageParams
from app.modules.pages.models import ContentPage

_LIVE = {"deleted_at": None}


async def get(item_id: str) -> ContentPage | None:
    if not PydanticObjectId.is_valid(item_id):
        return None
    return await ContentPage.find_one({"_id": PydanticObjectId(item_id), **_LIVE})


async def get_by_key(value: str) -> ContentPage | None:
    return await ContentPage.find_one({"key": value, **_LIVE})


async def unique_taken(value: str, exclude_id: PydanticObjectId | None = None) -> bool:
    query = {"key": value}
    if exclude_id is not None:
        query["_id"] = {"$ne": exclude_id}
    return await ContentPage.find_one(query) is not None


async def list_admin(
    page: PageParams, q: str | None, active: bool | None
) -> tuple[list[ContentPage], int]:
    query: dict = dict(_LIVE)
    if q and q.strip():
        query["key"] = {"$regex": "^" + re.escape(q.strip()), "$options": "i"}
    if active is not None:
        query["published"] = active
    finder = ContentPage.find(query)
    total = await finder.count()
    items = await finder.sort("key").skip(page.skip).limit(page.page_size).to_list()
    return items, total


async def list_public() -> list[ContentPage]:
    return await ContentPage.find({"published": True, **_LIVE}).sort("key").to_list()


async def get_public_by_key(key: str) -> ContentPage | None:
    return await ContentPage.find_one({"key": key, "published": True, **_LIVE})
