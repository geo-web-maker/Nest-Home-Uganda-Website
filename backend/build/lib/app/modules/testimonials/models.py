"""MongoDB document for this content type."""

from pydantic import Field

from app.core.models import ContentDocument


class Testimonial(ContentDocument):
    """One testimonial content record."""

    first_name: str
    area: str
    quote: dict[str, str] = Field(default_factory=dict)
    permission_received: bool = False
    approved: bool = False

    class Settings:
        name = "testimonials"
