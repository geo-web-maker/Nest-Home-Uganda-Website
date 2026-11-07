"""Request and response schemas for content management."""

import re
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app.core.i18n import LocalizedText

Slug = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
    ),
]
_OBJECT_ID = re.compile(r"^[0-9a-f]{24}$")


class TestimonialIn(BaseModel):
    """Fields supplied by an administrator."""

    first_name: str
    area: str
    quote: LocalizedText = Field(default_factory=dict)
    permission_received: bool
    approved: bool


class TestimonialUpdate(BaseModel):
    """PATCH schema. Only supplied fields are changed."""

    first_name: str | None = None
    area: str | None = None
    quote: LocalizedText | None = None
    permission_received: bool | None = None
    approved: bool | None = None


class TestimonialAdminOut(TestimonialIn):
    """Full administrative response."""

    id: str
    created_at: datetime
    updated_at: datetime


class TestimonialPublic(BaseModel):
    """Resolved public response. Private workflow fields are omitted."""

    id: str
    first_name: str
    area: str
    quote: str
