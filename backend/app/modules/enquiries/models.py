from datetime import UTC, datetime
from typing import Any, Literal

from beanie import PydanticObjectId
from pydantic import BaseModel, Field

from app.core.models import TimestampedDocument

Status = Literal["new", "contacted", "assessment_booked", "care_started", "not_proceeding", "spam"]
Source = Literal["form", "whatsapp_button", "call_button", "manual"]
EventKind = Literal["received", "alert_sent", "status_change", "assignment", "note"]
Relationship = Literal["self", "parent", "spouse", "child", "other"]
PreferredStart = Literal["today", "this_week", "later", "not_sure"]


def _now() -> datetime:
    return datetime.now(UTC)


class EnquiryEvent(BaseModel):
    at: datetime = Field(default_factory=_now)
    user_id: str | None = None
    kind: EventKind
    data: dict[str, Any] = Field(default_factory=dict)
    text: str = ""


class EnquiryService(BaseModel):
    service_id: PydanticObjectId
    name_snapshot: str  # so history stays readable after a service is renamed (spec 8.1)


class Enquiry(TimestampedDocument):
    """A request for care (spec 8.3). Events are embedded: they are read with the enquiry."""

    reference: str
    name: str
    phone_raw: str
    phone_e164: str
    relationship: Relationship
    services: list[EnquiryService] = Field(default_factory=list)
    area: str
    preferred_start: PreferredStart | None = None
    note: str = ""
    source: Source = "form"
    status: Status = "new"
    not_proceeding_reason: str | None = None
    assigned_to: PydanticObjectId | None = None
    consent: bool = False
    consent_at: datetime | None = None
    language: str = "en"
    ip_hash: str | None = None
    user_agent: str | None = None
    first_contacted_at: datetime | None = None
    closed_at: datetime | None = None
    events: list[EnquiryEvent] = Field(default_factory=list)
    # Notification bookkeeping (not in spec 8.3; see BUILD_LOG S4 deviations)
    visitor_sms_done: bool = False  # the visitor SMS is attempted once per enquiry
    reminders_sent: int = 0
    last_reminder_at: datetime | None = None
    anonymised_at: datetime | None = None

    class Settings:
        name = "enquiries"
