"""Request and response schemas for content management."""

import re
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator

from app.core.i18n import LocalizedText

# Spec 8.3 keys such as about_story and about_credentials contain underscores.
Slug = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=100,
        pattern=r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$",
    ),
]
_OBJECT_ID = re.compile(r"^[0-9a-f]{24}$")


class ContentPageIn(BaseModel):
    """Fields supplied by an administrator."""

    key: Slug
    title: LocalizedText
    body: LocalizedText = Field(default_factory=dict)
    published: bool = False

    @field_validator("title")
    @classmethod
    def require_english_title(cls, value: dict[str, str]) -> dict[str, str]:
        if not value.get("en"):
            raise ValueError("an English value is required")
        return value


class ContentPageUpdate(BaseModel):
    """PATCH schema. Only supplied fields are changed."""

    key: Slug | None = None
    title: LocalizedText | None = None
    body: LocalizedText | None = None
    published: bool | None = None


class ContentPageAdminOut(ContentPageIn):
    """Full administrative response."""

    id: str
    created_at: datetime
    updated_at: datetime


class ContentPagePublic(BaseModel):
    """Resolved public response. Private workflow fields are omitted."""

    id: str
    key: Slug
    title: str
    body: str
