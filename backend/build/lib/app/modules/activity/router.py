from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import Principal, require_scopes
from app.core.pagination import PageParams, page_params
from app.core.totp_guard import require_totp_session
from app.modules.activity.schemas import ActivityPage
from app.modules.activity.service import list_activity

router = APIRouter(prefix="/admin/activity", tags=["admin-activity"])
CanRead = Annotated[Principal, Depends(require_scopes("activity:read"))]


@router.get("", response_model=ActivityPage)
async def activity_list(
    _: CanRead,
    page: Annotated[PageParams, Depends(page_params)],
    _totp: Principal = Depends(require_totp_session),
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
    actor_id: Annotated[str | None, Query()] = None,
    item_type: Annotated[str | None, Query()] = None,
    item_id: Annotated[str | None, Query()] = None,
    severity: Annotated[str | None, Query()] = None,
    event_type: Annotated[str | None, Query()] = None,
    source: Annotated[str | None, Query()] = None,
    outcome: Annotated[str | None, Query()] = None,
    cursor: Annotated[str | None, Query()] = None,
) -> ActivityPage:
    result = await list_activity(page, start, end, actor_id, item_type, item_id, cursor, severity, event_type, source, outcome)
    from app.modules.audit.service import record_system_event
    await record_system_event(action="audit.view.admin", message="Administrator viewed the activity log.", severity="info", source="audit", user_id=_.user_id, outcome="success", event_type="activity", details={"filters_applied": bool(start or end or actor_id or item_type or item_id or severity or event_type or source or outcome or cursor)})
    return result
