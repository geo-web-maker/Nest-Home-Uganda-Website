"""MongoDB document for this content type."""

from beanie import PydanticObjectId
from pydantic import Field

from app.core.models import ContentDocument


class Faq(ContentDocument):
    """One faq content record."""

    question: dict[str, str] = Field(default_factory=dict)
    answer: dict[str, str] = Field(default_factory=dict)
    service_id: PydanticObjectId | None = None
    sort_order: int = 0
    published: bool = False

    class Settings:
        name = "faqs"
