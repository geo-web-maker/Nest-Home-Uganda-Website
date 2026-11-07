"""Team member documents for the team content collection."""

from beanie import PydanticObjectId
from pydantic import Field

from app.core.models import ContentDocument


class TeamMember(ContentDocument):
    """One team member, with private registration information."""

    name: str
    role: dict[str, str] = Field(default_factory=dict)
    qualification: dict[str, str] = Field(default_factory=dict)
    registration_number: str | None = None
    bio: dict[str, str] = Field(default_factory=dict)
    photo_media_id: PydanticObjectId | None = None
    sort_order: int = 0
    published: bool = False

    class Settings:
        name = "team_members"
