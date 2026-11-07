"""Database queries for content documents."""

import re

from beanie import PydanticObjectId

from app.core.pagination import PageParams
from app.modules.faqs.models import Faq

_LIVE = {"deleted_at": None}


async def get(item_id: str) -> Faq | None:
    if not PydanticObjectId.is_valid(item_id):
        return None
    return await Faq.find_one({"_id": PydanticObjectId(item_id), **_LIVE})


async def list_admin(page: PageParams, q: str | None, active: bool | None) -> tuple[list[Faq], int]:
    query: dict = dict(_LIVE)
    if q and q.strip():
        query["question.en"] = {"$regex": "^" + re.escape(q.strip()), "$options": "i"}
    if active is not None:
        query["published"] = active
    finder = Faq.find(query)
    total = await finder.count()
    items = (
        await finder.sort("sort_order", "question").skip(page.skip).limit(page.page_size).to_list()
    )
    return items, total


async def list_public() -> list[Faq]:
    return await Faq.find({"published": True, **_LIVE}).sort("sort_order", "question").to_list()
