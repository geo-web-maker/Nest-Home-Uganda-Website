"""Queries for jobs. Closed and soft-deleted jobs are hidden from the public API."""

import re
from datetime import datetime

from beanie import PydanticObjectId

from app.core import db
from app.core.pagination import PageParams
from app.modules.jobs.models import Job

_LIVE = {"deleted_at": None}


def local_today() -> str:
    # Kampala is UTC+3 year-round. Use its local calendar day for closing dates.
    from zoneinfo import ZoneInfo

    return datetime.now(ZoneInfo("Africa/Kampala")).date().isoformat()


async def get(job_id: str) -> Job | None:
    if not PydanticObjectId.is_valid(job_id):
        return None
    return await Job.find_one({"_id": PydanticObjectId(job_id), **_LIVE})


async def list_admin(
    page: PageParams, q: str | None, published: bool | None
) -> tuple[list[Job], int]:
    query: dict = dict(_LIVE)
    if q and q.strip():
        term = re.escape(q.strip())
        query["$or"] = [
            {"title.en": {"$regex": f"^{term}", "$options": "i"}},
            {"location": {"$regex": f"^{term}", "$options": "i"}},
        ]
    if published is not None:
        query["published"] = published
    finder = Job.find(query)
    total = await finder.count()
    items = await finder.sort("-created_at", "_id").skip(page.skip).limit(page.page_size).to_list()
    return items, total


async def list_public() -> list[Job]:
    today = local_today()
    return await Job.find(
        {
            "published": True,
            "closed_at": None,
            "deleted_at": None,
            "$or": [{"closes_on": None}, {"closes_on": {"$gte": today}}],
        }
    ).sort("-created_at", "_id").to_list()


async def get_public(job_id: str) -> Job | None:
    if not PydanticObjectId.is_valid(job_id):
        return None
    today = local_today()
    return await Job.find_one(
        {
            "_id": PydanticObjectId(job_id),
            "published": True,
            "closed_at": None,
            "deleted_at": None,
            "$or": [{"closes_on": None}, {"closes_on": {"$gte": today}}],
        }
    )


async def applicants_count(job_id: PydanticObjectId) -> int:
    # The applications module lands in S5.18. Count from its collection without importing it.
    return await db.get_database()["applications"].count_documents({"job_id": job_id})
