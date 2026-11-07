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


class FaqIn(BaseModel):
    """Fields supplied by an administrator."""

    question: LocalizedText
    answer: LocalizedText = Field(default_factory=dict)
    service_id: str | None = None
    sort_order: int
    published: bool

    @field_validator("service_id")
    @classmethod
    def validate_service_id(cls, value: str | None) -> str | None:
        if value is not None and not _OBJECT_ID.fullmatch(value):
            raise ValueError("not a valid id")
        return value

    @field_validator("question")
    @classmethod
    def require_english_question(cls, value: dict[str, str]) -> dict[str, str]:
        if not value.get("en"):
            raise ValueError("an English value is required")
        return value


class FaqUpdate(BaseModel):
    """PATCH schema. Only supplied fields are changed."""

    question: LocalizedText | None = None
    answer: LocalizedText | None = None
    service_id: str | None = None
    sort_order: int | None = None
    published: bool | None = None

    @field_validator("service_id")
    @classmethod
    def validate_service_id(cls, value: str | None) -> str | None:
        if value is not None and not _OBJECT_ID.fullmatch(value):
            raise ValueError("not a valid id")
        return value


class FaqAdminOut(FaqIn):
    """Full administrative response."""

    id: str
    created_at: datetime
    updated_at: datetime


class FaqPublic(BaseModel):
    """Resolved public response. Private workflow fields are omitted."""

    id: str
    question: str
    answer: str
    service_id: str | None
    sort_order: int
