from datetime import UTC, datetime
from typing import Any

from beanie import Document
from pydantic import Field


class Visit(Document):
    id: str = Field(index=True, unique=True)
    client_id: str = Field(index=True)
    nurse_id: str = Field(index=True)
    supervisor_id: str | None = None
    place_id: str
    scheduled_start: datetime = Field(index=True)
    scheduled_end: datetime
    status: str = "scheduled"
    instructions: str = Field(default="", max_length=1000)
    adhoc: bool = False
    created_by: str | None = None
    place_snapshot: dict[str, Any] = Field(default_factory=dict)
    check_in_at: datetime | None = None
    check_out_at: datetime | None = None
    safety_timer_until: datetime | None = None
    safety_state: str = "off"
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC), index=True)

    class Settings:
        name = "visits"


class VisitSyncTombstone(Document):
    """A minimal removal record for a nurse whose visit was cancelled or reassigned."""

    id: str = Field(index=True, unique=True)
    nurse_id: str = Field(index=True)
    visit_id: str = Field(index=True)
    reason: str = Field(default="removed", max_length=40)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC), index=True)

    class Settings:
        name = "visit_sync_tombstones"


class VisitEvent(Document):
    id: str = Field(index=True, unique=True)
    client_op_id: str = Field(index=True, unique=True)
    visit_id: str = Field(index=True)
    nurse_id: str = Field(index=True)
    type: str
    device_time: datetime
    sent_at_device: datetime
    received_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    clock_offset_s: float = 0
    lat: float | None = None
    lng: float | None = None
    accuracy_m: float = 0
    source: str = "pwa_manual"
    verification: str = "no_location"
    distance_m: float | None = None
    result: str = "accepted"

    class Settings:
        name = "visit_events"


class VisitNote(Document):
    id: str = Field(index=True, unique=True)
    client_op_id: str = Field(index=True, unique=True)
    visit_id: str = Field(index=True)
    nurse_id: str = Field(index=True)
    body: str = Field(max_length=1000)
    created_at_device: datetime
    geo_snap: dict[str, Any] = Field(default_factory=dict)
    in_range: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "visit_notes"


class VisitPhoto(Document):
    id: str = Field(index=True, unique=True)
    visit_id: str = Field(index=True)
    nurse_id: str = Field(index=True)
    cloudinary_public_id: str
    delivery_type: str = (
        "upload"  # old records remain accessible; new registrations use private delivery
    )
    photo_type: str = "other"
    status: str = "pending"
    hidden_at: datetime | None = None
    hidden_by: str | None = None
    hidden_reason: str | None = None
    geo_snap: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "visit_photos"


class VisitAnnotation(Document):
    id: str = Field(index=True, unique=True)
    visit_id: str = Field(index=True)
    user_id: str
    comment: str = Field(min_length=3, max_length=1000)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "visit_annotations"
