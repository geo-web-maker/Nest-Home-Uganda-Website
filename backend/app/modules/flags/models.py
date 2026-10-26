from datetime import UTC, datetime
from typing import Any

from beanie import Document
from pydantic import Field


class VisitFlag(Document):
    id: str = Field(index=True, unique=True)
    visit_id: str = Field(index=True)
    nurse_id: str = Field(index=True)
    type: str
    dedupe_key: str = Field(index=True, unique=True)
    raised_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    status: str = "open"
    resolved_at: datetime | None = None
    resolved_by: str | None = None
    resolution_note: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)

    class Settings:
        name = "visit_flags"
