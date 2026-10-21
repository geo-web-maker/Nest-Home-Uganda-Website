"""Read-only activity history with actor names resolved for the admin table."""

from datetime import date

from beanie import PydanticObjectId

from app.core.pagination import PageParams
from app.core.reporting import date_range, display_action
from app.modules.activity.schemas import ActivityItem, ActivityPage
from app.modules.audit.models import AuditLog
from app.modules.auth.models import User


async def list_activity(page: PageParams, start: date | None, end: date | None) -> ActivityPage:
    if start and end and end < start:
        from app.core.errors import ValidationFailed

        raise ValidationFailed(
            "The end date must not be before the start date.", {"to": "invalid range"}
        )
    query = date_range(start, end, "at")
    finder = AuditLog.find(query)
    total = await finder.count()
    docs = await finder.sort("-at").skip(page.skip).limit(page.page_size).to_list()
    actor_ids: set[PydanticObjectId] = {doc.user_id for doc in docs if doc.user_id is not None}
    users = await User.find({"_id": {"$in": list(actor_ids)}}).to_list() if actor_ids else []
    names = {str(user.id): user.name for user in users}
    items = [
        ActivityItem(
            id=str(doc.id),
            at=doc.at,
            user_name=names.get(str(doc.user_id)) if doc.user_id is not None else None,
            action=display_action(doc.action, doc.item_type, doc.before, doc.after, doc.item_label),
            item_type=doc.item_type,
            item_label=doc.item_label,
        )
        for doc in docs
    ]
    return ActivityPage(items=items, total=total, page=page.page, page_size=page.page_size)
