"""Read-only activity history with actor names resolved for the admin table."""

import base64
import json
from datetime import UTC, date, datetime

from beanie import PydanticObjectId

from app.core.pagination import PageParams
from app.core.reporting import date_range, display_action
from app.modules.activity.schemas import ActivityItem, ActivityPage
from app.modules.audit.models import AuditLog
from app.modules.auth.models import User


async def list_activity(
    page: PageParams,
    start: date | None,
    end: date | None,
    actor_id: str | None = None,
    item_type: str | None = None,
    item_id: str | None = None,
    cursor: str | None = None,
) -> ActivityPage:
    if start and end and end < start:
        from app.core.errors import ValidationFailed

        raise ValidationFailed(
            "The end date must not be before the start date.", {"to": "invalid range"}
        )
    query = date_range(start, end, "at")
    if actor_id:
        try:
            query["user_id"] = PydanticObjectId(actor_id)
        except Exception:
            from app.core.errors import ValidationFailed

            raise ValidationFailed("The actor id is invalid.", {"actor_id": "invalid"}) from None
    if item_type:
        query["item_type"] = item_type
    if item_id:
        query["item_id"] = item_id
    if cursor:
        try:
            raw = json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)).decode())
            at = datetime.fromisoformat(raw["at"]).astimezone(UTC)
            oid = PydanticObjectId(raw["id"])
            query = {
                "$and": [query, {"$or": [{"at": {"$lt": at}}, {"at": at, "_id": {"$lt": oid}}]}]
            }
        except Exception:
            from app.core.errors import ValidationFailed

            raise ValidationFailed(
                "The activity cursor is invalid.", {"cursor": "invalid"}
            ) from None
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
    next_cursor = None
    if docs:
        last = docs[-1]
        payload = json.dumps(
            {"at": last.at.astimezone(UTC).isoformat(), "id": str(last.id)}
        ).encode()
        next_cursor = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    return ActivityPage(
        items=items, total=total, page=page.page, page_size=page.page_size, next_cursor=next_cursor
    )
