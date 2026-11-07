"""Database queries for content documents."""

import re
from datetime import UTC, datetime

from beanie import PydanticObjectId

from app.core.pagination import PageParams
from app.modules.articles.models import Article

_LIVE = {"deleted_at": None}


async def get(item_id: str) -> Article | None:
    if not PydanticObjectId.is_valid(item_id):
        return None
    return await Article.find_one({"_id": PydanticObjectId(item_id), **_LIVE})


async def get_by_slug(value: str) -> Article | None:
    return await Article.find_one({"slug": value, **_LIVE})


async def unique_taken(value: str, exclude_id: PydanticObjectId | None = None) -> bool:
    query = {"slug": value}
    if exclude_id is not None:
        query["_id"] = {"$ne": exclude_id}
    return await Article.find_one(query) is not None


async def list_admin(
    page: PageParams, q: str | None, active: bool | None
) -> tuple[list[Article], int]:
    query: dict = dict(_LIVE)
    if q and q.strip():
        query["slug"] = {"$regex": "^" + re.escape(q.strip()), "$options": "i"}
    if active is not None:
        query["published_at"] = {"$ne": None} if active else None
    finder = Article.find(query)
    total = await finder.count()
    items = (
        await finder.sort("-published_at", "slug").skip(page.skip).limit(page.page_size).to_list()
    )
    return items, total


async def list_public() -> list[Article]:
    return (
        await Article.find({"published_at": {"$ne": None, "$lte": datetime.now(UTC)}, **_LIVE})
        .sort("-published_at", "slug")
        .to_list()
    )


async def get_public_by_slug(slug: str) -> Article | None:
    return await Article.find_one(
        {"slug": slug, "published_at": {"$ne": None, "$lte": datetime.now(UTC)}, **_LIVE}
    )
