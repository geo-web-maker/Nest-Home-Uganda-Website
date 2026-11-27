from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.password_policy import validate_password


class DeviceRegistration(BaseModel):
    device_id: str = Field(min_length=8, max_length=160)
    platform: str = Field(pattern="^(android|ios|web)$")
    push_token: str | None = Field(default=None, max_length=4096)


class NurseInvite(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    phone: str = Field(min_length=9, max_length=24)
    staff_number: str = Field(min_length=2, max_length=40)
    supervisor_id: str = Field(min_length=8, max_length=160)
    team_id: str | None = None


class NurseProfileForUser(BaseModel):
    """Superadmin-only: give an EXISTING account (for example an admin who is also a nurse) a nurse profile."""
    user: str = Field(min_length=3, max_length=200, description="The account's e-mail address or user id")
    staff_number: str | None = Field(default=None, min_length=2, max_length=40)
    supervisor_id: str | None = Field(default=None, min_length=8, max_length=160)
    team_id: str | None = None


class NurseDirectCreate(BaseModel):
    """Superadmin-only: create a nurse with a chosen password so the account works at once."""

    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    phone: str = Field(min_length=9, max_length=24)
    staff_number: str = Field(min_length=2, max_length=40)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("password")
    @classmethod
    def _password_ok(cls, value: str) -> str:
        return validate_password(value)
    supervisor_id: str | None = Field(default=None, min_length=8, max_length=160)
    team_id: str | None = None


class NursePatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    phone: str | None = Field(default=None, min_length=9, max_length=24)
    staff_number: str | None = Field(default=None, min_length=2, max_length=40)
    active: bool | None = None


class SupervisorPatch(BaseModel):
    supervisor_id: str | None = None


class AdhocOverride(BaseModel):
    enabled: bool | None = None


class NurseProfileResponse(BaseModel):
    user_id: str
    name: str | None = None
    supervisor_name: str | None = None
    staff_number: str
    staff_number_provisional: bool = False
    dual_account: bool = False
    supervisor_id: str | None
    team_id: str | None
    active: bool
    phone_e164: str | None = None
    last_seen_at: datetime | None = None
    app_version: str | None = None
    unmc_number: str | None = None
    unmc_category: str | None = None
    unmc_licence_expiry: str | None = None
    unmc_verified_by: str | None = None
    unmc_verified_at: datetime | None = None


class DeviceRevocation(BaseModel):
    device_id: str = Field(min_length=8, max_length=160)


class NurseDetailsPerson(BaseModel):
    name: str | None = None
    email: str | None = None
    phone_e164: str | None = None
    is_active: bool | None = None
    dual_account: bool = False


class NurseDetailsProfile(BaseModel):
    user_id: str
    staff_number: str
    staff_number_provisional: bool = False
    supervisor_id: str | None = None
    team_id: str | None = None
    active: bool
    phone_e164: str | None = None
    last_seen_at: datetime | None = None
    app_version: str | None = None
    battery_pct: int | None = None
    adhoc_override: bool | None = None
    consent_versions: dict[str, str]
    unmc_number: str | None = None
    unmc_category: str | None = None
    unmc_licence_expiry: str | None = None
    unmc_verified_by: str | None = None
    unmc_verified_at: datetime | None = None


class NurseDetailsDevice(BaseModel):
    device_id: str
    platform: str
    registered_at: datetime
    revoked_at: datetime | None = None
    push_token_updated_at: datetime | None = None
    has_push_token: bool


class NurseDetailsConsent(BaseModel):
    type: str
    version: str
    source: str
    accepted_at: datetime


class NurseDetailsResponse(BaseModel):
    person: NurseDetailsPerson
    profile: NurseDetailsProfile
    devices: list[NurseDetailsDevice]
    consents: list[NurseDetailsConsent]


class NursePasswordSet(BaseModel):
    """Superadmin-only: give an invited nurse a working password at once."""

    password: str = Field(min_length=1, max_length=200)

    @field_validator("password")
    @classmethod
    def _password_ok(cls, value: str) -> str:
        return validate_password(value)
