"""MongoDB document for this content type."""

from datetime import datetime

from beanie import PydanticObjectId
from pydantic import Field

from app.core.models import ContentDocument


class Article(ContentDocument):
    """One article content record."""

    slug: str
    title: dict[str, str] = Field(default_factory=dict)
    body: dict[str, str] = Field(default_factory=dict)
    image_media_id: PydanticObjectId | None = None
    published_at: datetime | None = None

    class Settings:
        name = "articles"
