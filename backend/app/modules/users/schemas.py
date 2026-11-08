from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, EmailStr, Field, field_validator

from app.core.password_policy import validate_password


def _clean(value: str) -> str:
    return "".join(ch for ch in value if ch >= " " and ch != "\x7f").strip()


Clean = Annotated[str, BeforeValidator(lambda v: _clean(v) if isinstance(v, str) else v)]


class AdminUserOut(BaseModel):
    id: str
    name: str
    email: str
    scopes: list[str]
    is_superadmin: bool
    last_login: datetime | None
    status: Literal["active", "invited"]
    active: bool
    kind: str = "staff"
    reach: str = "all"


Delivery = Literal["email", "sms", "temp_password"]


class UserInvite(BaseModel):
    """An invite never creates a superadmin: that flag is changed by hand, by a superadmin."""

    name: Clean = Field(min_length=2, max_length=80)
    email: EmailStr = Field(max_length=254)
    scopes: list[str] = Field(default_factory=list, max_length=64)
    preset: Literal["nurse", "supervisor", "admin", "executive", "super_admin"] | None = None
    kind: Literal["staff", "nurse", "supervisor", "admin", "executive"] = "staff"
    reach: Literal["own", "team", "all"] = "all"
    phone: Clean | None = Field(default=None, max_length=32)
    # How the person is told: emailed link, texted link, and/or a temporary password shown to you.
    delivery: list[Delivery] = Field(default_factory=lambda: ["email"], min_length=1, max_length=3)


class ResetIn(BaseModel):
    delivery: list[Delivery] = Field(default_factory=lambda: ["email"], min_length=1, max_length=3)


class InviteOut(AdminUserOut):
    """The temporary password is returned once, here, and never stored in readable form."""

    temp_password: str | None = None
    delivered: dict[str, str] = Field(default_factory=dict)


class UserUpdate(BaseModel):
    """Only fields that are present change."""

    scopes: list[str] | None = Field(default=None, max_length=64)
    active: bool | None = None
    kind: Literal["staff", "nurse", "supervisor", "admin", "executive"] | None = None
    reach: Literal["own", "team", "all"] | None = None


class SetPasswordIn(BaseModel):
    token: str = Field(min_length=1, max_length=400)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("password")
    @classmethod
    def _password_ok(cls, value: str) -> str:
        return validate_password(value)


class LinkCheckIn(BaseModel):
    token: str = Field(min_length=1, max_length=400)
    purpose: Literal["invite", "reset"] | None = None


class LinkCheckOut(BaseModel):
    status: str
    purpose: str
    expires_at: str


class Done(BaseModel):
    status: str


class ResetOut(Done):
    temp_password: str | None = None
    delivered: dict[str, str] = Field(default_factory=dict)
