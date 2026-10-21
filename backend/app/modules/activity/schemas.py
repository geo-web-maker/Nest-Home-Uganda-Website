from datetime import datetime

from pydantic import BaseModel


class ActivityItem(BaseModel):
    id: str
    at: datetime
    user_name: str | None
    action: str
    item_type: str
    item_label: str | None


class ActivityPage(BaseModel):
    items: list[ActivityItem]
    total: int
    page: int
    page_size: int
