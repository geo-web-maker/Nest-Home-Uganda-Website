"""MongoDB document for this content type."""

from pydantic import Field

from app.core.models import ContentDocument


class Area(ContentDocument):
    """One area content record."""

    name: str
    sort_order: int = 0
    aliases: list[str] = Field(default_factory=list)

    class Settings:
        name = "areas"
