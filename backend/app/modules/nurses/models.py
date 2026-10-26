"""Nurse account and device documents. Clinical notes are intentionally not stored here."""

from datetime import UTC, datetime

from beanie import Document
from pydantic import Field


class NurseProfile(Document):
    user_id: str = Field(index=True, unique=True)
    staff_number: str
    supervisor_id: str | None = None
    team_id: str | None = None
    active: bool = True
    phone_e164: str | None = None
    last_seen_at: datetime | None = None
    app_version: str | None = None
    battery_pct: int | None = None
    consent_versions: dict[str, str] = Field(default_factory=dict)
    adhoc_override: bool | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "nurse_profiles"


class Device(Document):
    device_id: str = Field(index=True, unique=True)
    user_id: str = Field(index=True)
    platform: str
    push_token: str | None = None
    revoked_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    push_token_updated_at: datetime | None = None

    class Settings:
        name = "devices"
