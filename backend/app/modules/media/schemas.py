"""Media request and response schemas."""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app.core.i18n import LocalizedText

StorageKey = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
MimeType = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class MediaIn(BaseModel):
    """Metadata recorded for an uploaded public media object."""

    storage_key: StorageKey
    public_url: str = ""
    variants: dict[str, str] = Field(default_factory=dict)
    alt_text: LocalizedText = Field(default_factory=dict)
    mime: MimeType
    size_bytes: int = Field(ge=0)
    width: int | None = Field(default=None, ge=0)
    height: int | None = Field(default=None, ge=0)
    uploaded_by: str | None = None


class MediaUpdate(BaseModel):
    """Fields editable after upload."""

    alt_text: LocalizedText | None = None


class MediaAdminOut(MediaIn):
    id: str
    created_at: datetime
    updated_at: datetime


class MediaPublic(BaseModel):
    id: str
    public_url: str
    variants: dict[str, str]
    alt_text: str
    mime: str
    width: int | None
    height: int | None
