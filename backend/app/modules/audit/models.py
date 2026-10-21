from datetime import UTC, datetime
from typing import Any

from beanie import Document, PydanticObjectId
from pydantic import Field


def _now() -> datetime:
    return datetime.now(UTC)


class AuditLog(Document):
    """Every admin write and every export (spec 9.7). TTL 24 months via migration."""

    at: datetime = Field(default_factory=_now)
    user_id: PydanticObjectId | None = None
    action: str
    scope: str | None = None  # the scope(s) that authorised the action (12.4)
    item_type: str
    item_id: str | None = None
    item_label: str | None = None
    before: dict[str, Any] | None = None
    after: dict[str, Any] | None = None
    ip_hash: str | None = None

    class Settings:
        name = "audit_log"


class ContentVersion(Document):
    """The last 10 versions per content item; powers 'Undo last change'."""

    item_type: str
    item_id: str
    data: dict[str, Any]
    user_id: PydanticObjectId | None = None
    at: datetime = Field(default_factory=_now)

    class Settings:
        name = "content_versions"
