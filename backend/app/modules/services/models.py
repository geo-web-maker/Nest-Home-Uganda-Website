from beanie import PydanticObjectId
from pydantic import Field

from app.core.models import ContentDocument


class Service(ContentDocument):
    """One kind of care (spec 8.3). Text fields marked L are {lang: text} dicts."""

    slug: str
    name: dict[str, str] = Field(default_factory=dict)
    summary: dict[str, str] = Field(default_factory=dict)
    number: int = 0
    hero_label: dict[str, str] = Field(default_factory=dict)
    hero_headline: dict[str, str] = Field(default_factory=dict)
    hero_lead: dict[str, str] = Field(default_factory=dict)
    facts: list[dict[str, str]] = Field(default_factory=list)
    who_for: list[dict[str, str]] = Field(default_factory=list)
    includes: list[dict[str, str]] = Field(default_factory=list)
    how_often: dict[str, str] = Field(default_factory=dict)
    photo_media_id: PydanticObjectId | None = None
    icon_key: str | None = None
    related: list[PydanticObjectId] = Field(default_factory=list)
    seo_title: dict[str, str] = Field(default_factory=dict)
    seo_description: dict[str, str] = Field(default_factory=dict)
    sort_order: int = 0
    published: bool = False

    class Settings:
        name = "services"
