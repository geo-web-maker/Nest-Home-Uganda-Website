from datetime import UTC, datetime

from beanie import Document
from pydantic import Field


class CareClient(Document):
    id: str = Field(index=True, unique=True)
    display_name: str = Field(min_length=1, max_length=120)
    notes_for_nurse: str = Field(default="", max_length=280)
    status: str = "active"
    supervisor_id: str | None = None
    assigned_nurse_ids: list[str] = Field(default_factory=list)
    photo_allowed: bool = False
    photo_required: str | None = Field(
        default=None, pattern=r"^(none|arrival|departure|either|both)$"
    )
    photo_guidance_text: str | None = Field(default=None, max_length=2000)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "care_clients"
