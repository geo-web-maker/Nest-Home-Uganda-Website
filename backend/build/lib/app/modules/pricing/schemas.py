"""Request and response schemas for content management."""

import re
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator

from app.core.i18n import LocalizedText

Slug = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
    ),
]
_OBJECT_ID = re.compile(r"^[0-9a-f]{24}$")


class PricingBlockIn(BaseModel):
    """Fields supplied by an administrator."""

    key: Literal["assessment", "quote", "plan"]
    tag: LocalizedText = Field(default_factory=dict)
    title: LocalizedText
    text: LocalizedText = Field(default_factory=dict)
    price_text: LocalizedText = Field(default_factory=dict)
    show: bool
    sort_order: int

    @field_validator("title")
    @classmethod
    def require_english_title(cls, value: dict[str, str]) -> dict[str, str]:
        if not value.get("en"):
            raise ValueError("an English value is required")
        return value


class PricingBlockUpdate(BaseModel):
    """PATCH schema. Only supplied fields are changed."""

    key: Literal["assessment", "quote", "plan"] | None = None
    tag: LocalizedText | None = None
    title: LocalizedText | None = None
    text: LocalizedText | None = None
    price_text: LocalizedText | None = None
    show: bool | None = None
    sort_order: int | None = None

    @field_validator("title")
    @classmethod
    def require_english_title(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        if value is not None and not value.get("en"):
            raise ValueError("an English value is required")
        return value


class PricingBlockAdminOut(PricingBlockIn):
    """Full administrative response."""

    id: str
    created_at: datetime
    updated_at: datetime


class PricingBlockPublic(BaseModel):
    """Resolved public response. Private workflow fields are omitted."""

    id: str
    key: Literal["assessment", "quote", "plan"]
    tag: str
    title: str
    text: str
    price_text: str
    sort_order: int
