from datetime import UTC, datetime
from typing import Any, Literal

from beanie import PydanticObjectId
from pydantic import BaseModel, Field

from app.core.models import TimestampedDocument

Stage = Literal["received", "shortlisted", "interview", "checks", "offer", "hired", "declined"]
EventKind = Literal["received", "stage_change", "rating", "note", "cv_viewed"]


def _now() -> datetime:
    return datetime.now(UTC)


class ApplicationEvent(BaseModel):
    at: datetime = Field(default_factory=_now)
    user_id: str | None = None
    kind: EventKind
    data: dict[str, Any] = Field(default_factory=dict)
    text: str = ""


class Application(TimestampedDocument):
    """One job application or general expression of interest (spec 8.3).

    `job_id` is an ObjectId (or null for general interest) because the jobs, dashboard and
    reports modules already read this collection with that type.
    """

    job_id: PydanticObjectId | None = None
    job_title_snapshot: str = ""  # so the list stays readable after a job is edited or deleted
    name: str
    phone_raw: str
    phone_e164: str
    email: str
    registration_number: str = ""
    qualification: str
    experience_years: int
    area: str
    availability: str
    cv_file_key: str | None = None
    cv_file_name: str = ""
    cover_note: str = ""
    stage: Stage = "received"
    decline_reason: str | None = None
    rating: int | None = None
    consent: bool = False
    consent_at: datetime | None = None
    ip_hash: str | None = None
    delete_after: datetime | None = None  # 12 months after applying (spec 6.3, 8.3)
    events: list[ApplicationEvent] = Field(default_factory=list)

    class Settings:
        name = "applications"
