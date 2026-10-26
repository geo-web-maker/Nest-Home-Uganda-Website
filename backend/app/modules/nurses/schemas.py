from pydantic import BaseModel, EmailStr, Field


class DeviceRegistration(BaseModel):
    device_id: str = Field(min_length=8, max_length=160)
    platform: str = Field(pattern="^(android|ios|web)$")
    push_token: str | None = Field(default=None, max_length=4096)


class NurseInvite(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    phone: str = Field(min_length=9, max_length=24)
    staff_number: str = Field(min_length=2, max_length=40)
    supervisor_id: str | None = None
    team_id: str | None = None


class NursePatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    phone: str | None = Field(default=None, min_length=9, max_length=24)
    active: bool | None = None


class SupervisorPatch(BaseModel):
    supervisor_id: str | None = None


class AdhocOverride(BaseModel):
    enabled: bool | None = None


class NurseProfileResponse(BaseModel):
    user_id: str
    staff_number: str
    supervisor_id: str | None
    team_id: str | None
    active: bool
    phone_e164: str | None = None
    last_seen_at: object | None = None
    app_version: str | None = None


class DeviceRevocation(BaseModel):
    device_id: str = Field(min_length=8, max_length=160)
