"""Request and response schemas for team member content."""

import re
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator

from app.core.i18n import LocalizedText

_OBJECT_ID = re.compile(r"^[0-9a-f]{24}$")

TeamMemberName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1),
]


def _photo_id(value: str | None) -> str | None:
    if value is not None and not _OBJECT_ID.fullmatch(value):
        raise ValueError("not a valid id")
    return value


class TeamMemberIn(BaseModel):
    """Fields an administrator can set."""

    name: TeamMemberName
    role: LocalizedText
    qualification: LocalizedText
    registration_number: str | None = None
    bio: LocalizedText = Field(default_factory=dict)
    photo_media_id: str | None = None
    sort_order: int = 0
    published: bool = False

    @field_validator("photo_media_id")
    @classmethod
    def validate_photo_id(cls, value: str | None) -> str | None:
        return _photo_id(value)


class TeamMemberUpdate(BaseModel):
    """PATCH body. Only supplied fields are changed."""

    name: TeamMemberName | None = None
    role: LocalizedText | None = None
    qualification: LocalizedText | None = None
    registration_number: str | None = None
    bio: LocalizedText | None = None
    photo_media_id: str | None = None
    sort_order: int | None = None
    published: bool | None = None

    @field_validator("photo_media_id")
    @classmethod
    def validate_photo_id(cls, value: str | None) -> str | None:
        return _photo_id(value)


class TeamMemberAdminOut(TeamMemberIn):
    """Admin response, including registration information."""

    id: str
    created_at: datetime
    updated_at: datetime


class TeamMemberPublic(BaseModel):
    """Fields consumed by the public team grid. Registration data stays private."""

    id: str
    name: str
    role: str
    qualification: str
    photo_media_id: str | None
