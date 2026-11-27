"""Nurse account and device documents. Clinical notes are intentionally not stored here."""

from datetime import UTC, datetime

from beanie import Document
from pydantic import Field
from app.core.sandbox import hide_test_data


@hide_test_data("user_id")
class NurseProfile(Document):
    user_id: str = Field(index=True, unique=True)
    staff_number: str
    staff_number_provisional: bool = False
    provisioned_source: str | None = None
    provisioned_at: datetime | None = None
    supervisor_id: str | None = None
    team_id: str | None = None
    active: bool = True
    phone_e164: str | None = None
    # UNMC registration: optional, nurse-edited, self-declared until a different admin verifies it.
    unmc_number: str | None = None
    unmc_category: str | None = None
    unmc_licence_expiry: str | None = None  # ISO date
    unmc_verified_by: str | None = None
    unmc_verified_at: datetime | None = None
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
    app: str | None = None  # "nurse" or "admin": which Android app registered this device

    class Settings:
        name = "devices"
