"""Queries only. Soft-deleted documents (deleted_at set) are never returned."""

import re

from beanie import PydanticObjectId

from app.core.pagination import PageParams
from app.modules.services.models import Service

_LIVE = {"deleted_at": None}


async def get(service_id: str) -> Service | None:
    if not PydanticObjectId.is_valid(service_id):
        return None
    return await Service.find_one({"_id": PydanticObjectId(service_id), **_LIVE})


async def get_published_by_slug(slug: str) -> Service | None:
    return await Service.find_one({"slug": slug, "published": True, **_LIVE})


async def slug_taken(slug: str, exclude_id: PydanticObjectId | None = None) -> bool:
    query: dict = {"slug": slug}  # includes soft-deleted: the unique index does too
    if exclude_id is not None:
        query["_id"] = {"$ne": exclude_id}
    return await Service.find_one(query) is not None


async def count_live(ids: list[PydanticObjectId]) -> int:
    return await Service.find({"_id": {"$in": ids}, **_LIVE}).count()


async def list_admin(
    page: PageParams, q: str | None, published: bool | None
) -> tuple[list[Service], int]:
    query: dict = dict(_LIVE)
    if q:
        query["slug"] = {"$regex": "^" + re.escape(q.strip().lower())}  # anchored prefix
    if published is not None:
        query["published"] = published
    finder = Service.find(query)
    total = await finder.count()
    items = await finder.sort("sort_order", "slug").skip(page.skip).limit(page.page_size).to_list()
    return items, total


async def list_published() -> list[Service]:
    return await Service.find({"published": True, **_LIVE}).sort("sort_order", "slug").to_list()


async def get_many_published(ids: list[PydanticObjectId]) -> list[Service]:
    return await Service.find({"_id": {"$in": ids}, "published": True, **_LIVE}).to_list()
