"""Database queries for content documents."""

import re

from beanie import PydanticObjectId

from app.core.pagination import PageParams
from app.modules.pricing.models import PricingBlock

_LIVE = {"deleted_at": None}


async def get(item_id: str) -> PricingBlock | None:
    if not PydanticObjectId.is_valid(item_id):
        return None
    return await PricingBlock.find_one({"_id": PydanticObjectId(item_id), **_LIVE})


async def key_taken(key: str, exclude_id: PydanticObjectId | None = None) -> bool:
    query: dict = {"key": key}  # includes soft-deleted: the unique index does too
    if exclude_id is not None:
        query["_id"] = {"$ne": exclude_id}
    return await PricingBlock.find_one(query) is not None


async def list_admin(
    page: PageParams, q: str | None, active: bool | None
) -> tuple[list[PricingBlock], int]:
    query: dict = dict(_LIVE)
    if q and q.strip():
        query["key"] = {"$regex": "^" + re.escape(q.strip()), "$options": "i"}
    if active is not None:
        query["show"] = active
    finder = PricingBlock.find(query)
    total = await finder.count()
    items = await finder.sort("sort_order", "key").skip(page.skip).limit(page.page_size).to_list()
    return items, total


async def list_public() -> list[PricingBlock]:
    return await PricingBlock.find({"show": True, **_LIVE}).sort("sort_order", "key").to_list()
