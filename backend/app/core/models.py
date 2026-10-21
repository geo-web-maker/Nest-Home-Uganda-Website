"""Base document with created_at and updated_at (spec 8.1). Content adds deleted_at."""

from datetime import UTC, datetime

from beanie import Document, Insert, Replace, Save, SaveChanges, Update, before_event
from pydantic import Field


def utcnow() -> datetime:
    return datetime.now(UTC)


class TimestampedDocument(Document):
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    @before_event(Insert)
    def _stamp_new(self) -> None:
        now = utcnow()
        self.created_at = now
        self.updated_at = now

    @before_event(Replace, Save, SaveChanges, Update)
    def _stamp_change(self) -> None:
        self.updated_at = utcnow()


class ContentDocument(TimestampedDocument):
    deleted_at: datetime | None = None
