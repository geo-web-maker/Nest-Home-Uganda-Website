import re
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator

from app.core.i18n import LocalizedText
from app.modules.jobs.models import JobDepartment, JobType

_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _date(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    if not _DATE.fullmatch(value):
        raise ValueError("Use a date in YYYY-MM-DD format.")
    from datetime import date

    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("Enter a valid closing date.") from exc
    return value


Location = Annotated[str, StringConstraints(min_length=1, max_length=100, strip_whitespace=True)]


class JobIn(BaseModel):
    title: LocalizedText
    department: JobDepartment = "clinical"
    location: Location
    type: JobType = "full_time"
    description: LocalizedText = Field(default_factory=dict)
    requirements: LocalizedText = Field(default_factory=dict)
    closes_on: str | None = None
    registration_required: bool = False
    published: bool = False
    show_closing: bool = True

    @field_validator("title")
    @classmethod
    def _english_title(cls, value: dict[str, str]) -> dict[str, str]:
        if not value.get("en", "").strip():
            raise ValueError("An English job title is required.")
        return value

    @field_validator("closes_on")
    @classmethod
    def _closing_date(cls, value: str | None) -> str | None:
        return _date(value)


class JobUpdate(BaseModel):
    title: LocalizedText | None = None
    department: JobDepartment | None = None
    location: Location | None = None
    type: JobType | None = None
    description: LocalizedText | None = None
    requirements: LocalizedText | None = None
    closes_on: str | None = None
    registration_required: bool | None = None
    published: bool | None = None
    show_closing: bool | None = None

    @field_validator("title")
    @classmethod
    def _english_title(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        if value is not None and not value.get("en", "").strip():
            raise ValueError("An English job title is required.")
        return value

    @field_validator("closes_on")
    @classmethod
    def _closing_date(cls, value: str | None) -> str | None:
        return _date(value)


class JobAdminOut(BaseModel):
    id: str
    title: dict[str, str]
    department: JobDepartment
    location: str
    type: JobType
    description: dict[str, str]
    requirements: dict[str, str]
    closes_on: str | None
    registration_required: bool
    published: bool
    show_closing: bool
    closed_at: datetime | None
    applicants_count: int
    created_at: datetime
    updated_at: datetime


class JobPublicOut(BaseModel):
    id: str
    title: str
    department: JobDepartment
    location: str
    type: JobType
    description: str
    requirements: str
    closes_on: str | None
    registration_required: bool
