from datetime import datetime

from pydantic import BaseModel


class ActivityItem(BaseModel):
    id: str
    at: datetime
    user_name: str | None
    action: str
    item_type: str
    item_label: str | None
    event_type: str = "activity"
    severity: str = "info"
    source: str = "user"
    outcome: str = "success"
    message: str | None = None
    request_id: str | None = None
    endpoint: str | None = None
    http_status: int | None = None


class ActivityPage(BaseModel):
    items: list[ActivityItem]
    total: int
    page: int
    page_size: int
    next_cursor: str | None = None
