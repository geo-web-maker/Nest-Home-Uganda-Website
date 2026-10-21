from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, EmailStr, Field


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


class UserInvite(BaseModel):
    """An invite never creates a superadmin: that flag is changed by hand, by a superadmin."""

    name: Clean = Field(min_length=2, max_length=80)
    email: EmailStr = Field(max_length=254)
    scopes: list[str] = Field(default_factory=list, max_length=40)


class UserUpdate(BaseModel):
    """Only fields that are present change."""

    scopes: list[str] | None = Field(default=None, max_length=40)
    active: bool | None = None


class SetPasswordIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=12, max_length=200)


class Done(BaseModel):
    status: str
