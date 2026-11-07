"""Database queries for content documents."""

import re

from beanie import PydanticObjectId

from app.core.pagination import PageParams
from app.modules.testimonials.models import Testimonial

_LIVE = {"deleted_at": None}


async def get(item_id: str) -> Testimonial | None:
    if not PydanticObjectId.is_valid(item_id):
        return None
    return await Testimonial.find_one({"_id": PydanticObjectId(item_id), **_LIVE})


async def list_admin(
    page: PageParams, q: str | None, active: bool | None
) -> tuple[list[Testimonial], int]:
    query: dict = dict(_LIVE)
    if q and q.strip():
        query["first_name"] = {"$regex": "^" + re.escape(q.strip()), "$options": "i"}
    if active is not None:
        query["approved"] = active
    finder = Testimonial.find(query)
    total = await finder.count()
    items = await finder.sort("first_name").skip(page.skip).limit(page.page_size).to_list()
    return items, total


async def list_public() -> list[Testimonial]:
    return (
        await Testimonial.find({"approved": True, "permission_received": True, **_LIVE})
        .sort("first_name")
        .to_list()
    )
