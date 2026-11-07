"""Media metadata documents."""

from beanie import PydanticObjectId
from pydantic import Field

from app.core.models import ContentDocument


class Media(ContentDocument):
    storage_key: str
    public_url: str = ""
    variants: dict[str, str] = Field(default_factory=dict)
    alt_text: dict[str, str] = Field(default_factory=dict)
    mime: str
    size_bytes: int
    width: int | None = None
    height: int | None = None
    uploaded_by: PydanticObjectId | None = None

    class Settings:
        name = "media"
