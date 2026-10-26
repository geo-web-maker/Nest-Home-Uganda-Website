from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import Principal, require_scopes
from app.core.pagination import PageParams, page_params
from app.modules.activity.schemas import ActivityPage
from app.modules.activity.service import list_activity

router = APIRouter(prefix="/admin/activity", tags=["admin-activity"])
CanRead = Annotated[Principal, Depends(require_scopes("activity:read"))]


@router.get("", response_model=ActivityPage)
async def activity_list(
    _: CanRead,
    page: Annotated[PageParams, Depends(page_params)],
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
    actor_id: Annotated[str | None, Query()] = None,
    item_type: Annotated[str | None, Query()] = None,
    item_id: Annotated[str | None, Query()] = None,
    cursor: Annotated[str | None, Query()] = None,
) -> ActivityPage:
    return await list_activity(page, start, end, actor_id, item_type, item_id, cursor)
