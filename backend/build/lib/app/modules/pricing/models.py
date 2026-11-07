"""MongoDB document for this content type."""

from pydantic import Field

from app.core.models import ContentDocument


class PricingBlock(ContentDocument):
    """One pricing content record."""

    key: str
    tag: dict[str, str] = Field(default_factory=dict)
    title: dict[str, str] = Field(default_factory=dict)
    text: dict[str, str] = Field(default_factory=dict)
    price_text: dict[str, str] = Field(default_factory=dict)
    show: bool = False
    sort_order: int = 0

    class Settings:
        name = "pricing_blocks"
