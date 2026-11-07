"""Queries only. Applications are never soft-deleted here; deletion is a separate request."""

import re
from typing import Any

from beanie import PydanticObjectId

from app.core.pagination import PageParams
from app.modules.applications.models import Application, ApplicationEvent, Stage


async def get(application_id: str) -> Application | None:
    if not PydanticObjectId.is_valid(application_id):
        return None
    return await Application.get(PydanticObjectId(application_id))


async def list_admin(
    page: PageParams, stage: Stage | None, job_id: str | None, q: str | None
) -> tuple[list[Application], int]:
    query: dict[str, Any] = {}
    if stage:
        query["stage"] = stage
    if job_id and PydanticObjectId.is_valid(job_id):
        query["job_id"] = PydanticObjectId(job_id)
    if q and q.strip():
        term = re.escape(q.strip())
        query["$or"] = [
            {"name": {"$regex": f"^{term}", "$options": "i"}},
            {"email": {"$regex": f"^{term}", "$options": "i"}},
        ]
    finder = Application.find(query)
    total = await finder.count()
    items = await finder.sort("-created_at", "_id").skip(page.skip).limit(page.page_size).to_list()
    return items, total


async def push_event(application_id: PydanticObjectId, event: ApplicationEvent) -> None:
    await Application.get_pymongo_collection().update_one(
        {"_id": application_id}, {"$push": {"events": event.model_dump()}}
    )
