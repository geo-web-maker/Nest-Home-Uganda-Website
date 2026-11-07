"""Request and response schemas for content management."""

import re
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator

from app.core.i18n import LocalizedText

Slug = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
    ),
]
_OBJECT_ID = re.compile(r"^[0-9a-f]{24}$")


class ArticleIn(BaseModel):
    """Fields supplied by an administrator."""

    slug: Slug
    title: LocalizedText
    body: LocalizedText = Field(default_factory=dict)
    image_media_id: str | None = None
    published_at: datetime | None = None

    @field_validator("image_media_id")
    @classmethod
    def validate_image_media_id(cls, value: str | None) -> str | None:
        if value is not None and not _OBJECT_ID.fullmatch(value):
            raise ValueError("not a valid id")
        return value

    @field_validator("title")
    @classmethod
    def require_english_title(cls, value: dict[str, str]) -> dict[str, str]:
        if not value.get("en"):
            raise ValueError("an English value is required")
        return value


class ArticleUpdate(BaseModel):
    """PATCH schema. Only supplied fields are changed."""

    slug: Slug | None = None
    title: LocalizedText | None = None
    body: LocalizedText | None = None
    image_media_id: str | None = None
    published_at: datetime | None = None

    @field_validator("image_media_id")
    @classmethod
    def validate_image_media_id(cls, value: str | None) -> str | None:
        if value is not None and not _OBJECT_ID.fullmatch(value):
            raise ValueError("not a valid id")
        return value


class ArticleAdminOut(ArticleIn):
    """Full administrative response."""

    id: str
    created_at: datetime
    updated_at: datetime


class ArticlePublic(BaseModel):
    """Resolved public response. Private workflow fields are omitted."""

    id: str
    slug: Slug
    title: str
    body: str
    image_media_id: str | None
    published_at: datetime | None
