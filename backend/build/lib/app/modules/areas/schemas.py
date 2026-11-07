"""Request and response schemas for content management."""

import re
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

Slug = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
    ),
]
_OBJECT_ID = re.compile(r"^[0-9a-f]{24}$")


AreaName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class AreaIn(BaseModel):
    """Fields supplied by an administrator."""

    name: AreaName
    sort_order: int
    aliases: list[str] = Field(default_factory=list)


class AreaUpdate(BaseModel):
    """PATCH schema. Only supplied fields are changed."""

    name: AreaName | None = None
    sort_order: int | None = None
    aliases: list[str] | None = None


class AreaAdminOut(AreaIn):
    """Full administrative response."""

    id: str
    created_at: datetime
    updated_at: datetime


class AreaPublic(BaseModel):
    """Resolved public response. Private workflow fields are omitted."""

    id: str
    name: str
    sort_order: int
    aliases: list[str]
