from datetime import datetime
from typing import Annotated, Literal

from beanie import PydanticObjectId
from pydantic import AfterValidator, BaseModel, EmailStr, Field, field_validator

from app.core.phone import normalise_e164
from app.modules.applications import rules
from app.modules.applications.models import Stage

Clean = Annotated[str, AfterValidator(rules.clean)]


class ApplicationCreate(BaseModel):
    """The text fields of the public form (spec 6.3). The CV file is checked separately."""

    job_id: str | None = None
    name: Clean = Field(min_length=2, max_length=100)
    phone: Clean = Field(max_length=30)
    email: EmailStr = Field(max_length=254)
    registration_number: Clean = Field(default="", max_length=100)
    qualification: Clean = Field(min_length=1, max_length=120)
    experience_years: int = Field(ge=0, le=50)
    area: Clean = Field(min_length=2, max_length=100)
    availability: Clean = Field(min_length=1, max_length=300)
    cover_note: Clean = Field(default="", max_length=1000)
    consent: bool
    website: str = Field(default="", max_length=200)  # honeypot: humans never see it

    @field_validator("job_id", mode="before")
    @classmethod
    def _job(cls, value: object) -> object:
        if value in (None, ""):
            return None
        if not isinstance(value, str) or not PydanticObjectId.is_valid(value):
            raise ValueError("Choose a role from the list.")
        return value

    @field_validator("name")
    @classmethod
    def _no_links(cls, value: str) -> str:
        if rules.has_link(value):
            raise ValueError("Please enter your name only.")
        return value

    @field_validator("phone")
    @classmethod
    def _uganda_phone(cls, value: str) -> str:
        if normalise_e164(value) is None:
            raise ValueError("Enter a valid Uganda phone number, for example 0787 499 988.")
        return value

    @field_validator("consent")
    @classmethod
    def _consent(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("Please tick the box so we can contact you.")
        return value


class ApplicationReceived(BaseModel):
    status: Literal["received"] = "received"


class ApplicationItem(BaseModel):
    id: str
    name: str
    job_id: str | None
    job_title: str
    experience_years: int
    stage: Stage
    rating: int | None
    applied_at: datetime


class ApplicationEventOut(BaseModel):
    at: datetime
    text: str
    user_name: str | None


class ApplicationDetail(ApplicationItem):
    phone_e164: str
    email: str
    registration_number: str
    qualification: str
    area: str
    availability: str
    cover_note: str
    cv_file_name: str
    cv_available: bool
    decline_reason: str | None
    answers: dict[str, str]
    events: list[ApplicationEventOut]


class ApplicationUpdate(BaseModel):
    """Only fields that are present change. `rating: null` clears the rating."""

    stage: Stage | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    decline_reason: Clean | None = Field(default=None, max_length=300)


class NoteIn(BaseModel):
    text: Clean = Field(min_length=1, max_length=1000)


class CvLink(BaseModel):
    url: str
    expires_at: datetime
