import re
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator

from app.core.i18n import LocalizedText

Slug = Annotated[
    str, StringConstraints(min_length=2, max_length=80, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
]
_OBJECT_ID = re.compile(r"^[0-9a-f]{24}$")


class ServiceIn(BaseModel):
    """Fields an admin can set. Every text field is a LocalizedText ({lang: text})."""

    slug: Slug
    name: LocalizedText
    summary: LocalizedText = Field(default_factory=dict)
    number: int = Field(default=0, ge=0, le=99)
    hero_label: LocalizedText = Field(default_factory=dict)
    hero_headline: LocalizedText = Field(default_factory=dict)
    hero_lead: LocalizedText = Field(default_factory=dict)
    facts: list[LocalizedText] = Field(default_factory=list, max_length=3)
    who_for: list[LocalizedText] = Field(default_factory=list, max_length=8)
    includes: list[LocalizedText] = Field(default_factory=list, max_length=12)
    how_often: LocalizedText = Field(default_factory=dict)
    photo_media_id: str | None = None
    icon_key: Annotated[str, StringConstraints(max_length=40)] | None = None
    related: list[str] = Field(default_factory=list, max_length=3)
    seo_title: LocalizedText = Field(default_factory=dict)
    seo_description: LocalizedText = Field(default_factory=dict)
    sort_order: int = Field(default=0, ge=0, le=999)
    published: bool = False

    @field_validator("photo_media_id")
    @classmethod
    def _photo_id(cls, v: str | None) -> str | None:
        if v is not None and not _OBJECT_ID.match(v):
            raise ValueError("not a valid id")
        return v

    @field_validator("related")
    @classmethod
    def _related_ids(cls, v: list[str]) -> list[str]:
        if any(not _OBJECT_ID.match(item) for item in v):
            raise ValueError("not a valid id")
        return list(dict.fromkeys(v))

    @field_validator("name")
    @classmethod
    def _name_has_english(cls, v: dict[str, str]) -> dict[str, str]:
        if not v.get("en"):
            raise ValueError("an English name is required")
        return v


class ServiceUpdate(BaseModel):
    """PATCH body: only the fields sent are changed. Same rules as ServiceIn."""

    slug: Slug | None = None
    name: LocalizedText | None = None
    summary: LocalizedText | None = None
    number: int | None = Field(default=None, ge=0, le=99)
    hero_label: LocalizedText | None = None
    hero_headline: LocalizedText | None = None
    hero_lead: LocalizedText | None = None
    facts: list[LocalizedText] | None = Field(default=None, max_length=3)
    who_for: list[LocalizedText] | None = Field(default=None, max_length=8)
    includes: list[LocalizedText] | None = Field(default=None, max_length=12)
    how_often: LocalizedText | None = None
    photo_media_id: str | None = None
    icon_key: Annotated[str, StringConstraints(max_length=40)] | None = None
    related: list[str] | None = Field(default=None, max_length=3)
    seo_title: LocalizedText | None = None
    seo_description: LocalizedText | None = None
    sort_order: int | None = Field(default=None, ge=0, le=999)
    published: bool | None = None

    _photo_id = field_validator("photo_media_id")(ServiceIn._photo_id.__func__)  # type: ignore[attr-defined]

    @field_validator("related")
    @classmethod
    def _related_ids(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        if any(not _OBJECT_ID.match(item) for item in v):
            raise ValueError("not a valid id")
        return list(dict.fromkeys(v))

    @field_validator("name")
    @classmethod
    def _name_has_english(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        if v is not None and not v.get("en"):
            raise ValueError("an English name is required")
        return v


class ServiceAdminOut(ServiceIn):
    """Admin read: full LocalizedText objects, plus the 'Content needed' flag."""

    id: str
    content_needed: bool
    created_at: datetime
    updated_at: datetime


class ServicePublicCard(BaseModel):
    """What the Services overview needs. Text is already resolved to one language."""

    id: str
    slug: str
    name: str
    summary: str
    number: int
    icon_key: str | None
    photo_media_id: str | None


class ServicePublicDetail(ServicePublicCard):
    hero_label: str
    hero_headline: str
    hero_lead: str
    facts: list[str]
    who_for: list[str]
    includes: list[str]
    how_often: str
    seo_title: str
    seo_description: str
    related: list[ServicePublicCard]
