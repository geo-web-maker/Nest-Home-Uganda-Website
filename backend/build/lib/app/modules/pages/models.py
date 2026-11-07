"""MongoDB document for this content type."""

from pydantic import Field

from app.core.models import ContentDocument


class ContentPage(ContentDocument):
    """One page content record."""

    key: str
    title: dict[str, str] = Field(default_factory=dict)
    body: dict[str, str] = Field(default_factory=dict)
    published: bool = False

    class Settings:
        name = "pages"
