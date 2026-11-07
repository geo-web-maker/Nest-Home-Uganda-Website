from datetime import datetime
from typing import Literal

from pydantic import Field

from app.core.models import ContentDocument

JobDepartment = Literal["clinical", "care", "admin"]
JobType = Literal["full_time", "part_time", "contract"]


class Job(ContentDocument):
    """A career role. Public text is stored as language-keyed objects (spec 8.3)."""

    title: dict[str, str] = Field(default_factory=dict)
    department: JobDepartment = "clinical"
    location: str
    type: JobType = "full_time"
    description: dict[str, str] = Field(default_factory=dict)
    requirements: dict[str, str] = Field(default_factory=dict)
    closes_on: str | None = None  # YYYY-MM-DD; string storage keeps date comparisons stable.
    registration_required: bool = False
    published: bool = False
    show_closing: bool = True
    closed_at: datetime | None = None

    class Settings:
        name = "jobs"
