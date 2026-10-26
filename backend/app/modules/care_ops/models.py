from datetime import UTC, datetime
from typing import Any

from beanie import Document
from pydantic import Field


class CareAlert(Document):
    id: str = Field(index=True, unique=True)
    type: str
    severity: str = "warning"
    status: str = "open"
    visit_id: str | None = None
    nurse_id: str | None = None
    supervisor_id: str | None = None
    message: str
    raised_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    acknowledged_at: datetime | None = None
    acknowledged_by: str | None = None
    resolved_at: datetime | None = None
    resolved_by: str | None = None
    history: list[dict[str, Any]] = Field(default_factory=list)

    class Settings:
        name = "care_alerts"


class CareTimesheet(Document):
    id: str = Field(index=True, unique=True)
    nurse_id: str = Field(index=True)
    period_start: str
    period_end: str
    period_kind: str = "weekly"
    status: str = "draft"
    completed_visits: int = 0
    total_minutes: int = 0
    issue_ids: list[str] = Field(default_factory=list)
    explained_issues: dict[str, str] = Field(default_factory=dict)
    submitted_at: datetime | None = None
    approved_at: datetime | None = None
    approved_by: str | None = None
    sent_back_reason: str | None = None
    adjustments: list[dict[str, Any]] = Field(default_factory=list)

    class Settings:
        name = "care_timesheets"


class SOSCase(Document):
    id: str = Field(index=True, unique=True)
    nurse_id: str = Field(index=True)
    visit_id: str | None = None
    status: str = "sent"
    test: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    acknowledged_at: datetime | None = None
    acknowledged_by: str | None = None
    events: list[dict[str, Any]] = Field(default_factory=list)

    class Settings:
        name = "sos_cases"


class CareInboxNotification(Document):
    id: str = Field(index=True, unique=True)
    user_id: str = Field(index=True)
    category: str
    title: str
    body: str
    read_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "care_inbox_notifications"


class CareDataRequest(Document):
    id: str = Field(index=True, unique=True)
    subject_id: str
    request_type: str
    status: str = "open"
    requested_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = None
    result_manifest: dict[str, Any] = Field(default_factory=dict)

    class Settings:
        name = "care_data_requests"


class CareSetting(Document):
    key: str = Field(index=True, unique=True)
    value: Any
    group: str
    updated_by: str | None = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "care_settings"


class SOSEvent(Document):
    id: str = Field(index=True, unique=True)
    case_id: str = Field(index=True)
    type: str
    actor_id: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    details: dict[str, Any] = Field(default_factory=dict)

    class Settings:
        name = "sos_events"


class CareConsent(Document):
    id: str = Field(index=True, unique=True)
    user_id: str = Field(index=True)
    client_id: str | None = Field(default=None, index=True)
    type: str
    version: str
    source: str = "field_app"
    accepted_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "care_consents"


class PushDelivery(Document):
    """Durable per-device push work item; notification text must contain no client details."""

    id: str = Field(index=True, unique=True)
    user_id: str = Field(index=True)
    device_id: str = Field(index=True)
    notification_id: str = Field(index=True)
    category: str
    title: str = Field(max_length=120)
    body: str = Field(max_length=300)
    data: dict[str, str] = Field(default_factory=dict)
    critical: bool = False
    status: str = "pending"
    attempts: int = 0
    next_attempt_at: datetime = Field(default_factory=lambda: datetime.now(UTC), index=True)
    last_error: str | None = None
    sent_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "push_deliveries"
