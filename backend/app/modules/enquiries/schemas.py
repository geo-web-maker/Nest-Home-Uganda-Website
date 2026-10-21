import re
from datetime import datetime
from typing import Annotated

from beanie import PydanticObjectId
from pydantic import AfterValidator, BaseModel, Field, field_validator

from app.core.phone import normalise_e164
from app.modules.enquiries.models import PreferredStart, Relationship, Source, Status

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_LINK = re.compile(
    r"(?i)(https?:|www\.|://|\b[\w-]+\.(?:com|net|org|info|biz|xyz|ru|cn|io|co|ug)\b)"
)


def _clean(value: str) -> str:
    return _CONTROL.sub("", value).strip()


Clean = Annotated[str, AfterValidator(_clean)]


class EnquiryFields(BaseModel):
    """Shared by the public form and the admin manual entry (spec 6.1, 6.4)."""

    name: Clean = Field(min_length=2, max_length=80)
    phone: Clean = Field(max_length=30)
    relationship: Relationship
    service_ids: list[str] = Field(min_length=1, max_length=8)
    area: Clean = Field(min_length=2, max_length=80)
    preferred_start: PreferredStart | None = None
    note: Clean = Field(default="", max_length=500)

    @field_validator("name")
    @classmethod
    def _no_links(cls, value: str) -> str:
        if _LINK.search(value):
            raise ValueError("Please enter your name only.")
        return value

    @field_validator("phone")
    @classmethod
    def _uganda_phone(cls, value: str) -> str:
        if normalise_e164(value) is None:
            raise ValueError("Enter a valid Uganda phone number, for example 0787 499 988.")
        return value

    @field_validator("service_ids")
    @classmethod
    def _ids(cls, value: list[str]) -> list[str]:
        unique = list(dict.fromkeys(value))
        if not all(PydanticObjectId.is_valid(v) for v in unique):
            raise ValueError("Choose the care you need from the list.")
        return unique


class EnquiryCreate(EnquiryFields):
    consent: bool
    website: str = Field(default="", max_length=200)  # honeypot: humans never see it

    @field_validator("consent")
    @classmethod
    def _consent(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("Please tick the box so we can contact you.")
        return value


class EnquiryManualIn(EnquiryFields):
    """Entered by staff from a phone call. No consent box, so no visitor SMS is sent."""


class EnquiryCreated(BaseModel):
    reference: str
    whatsapp_url: str


class EnquiryEventOut(BaseModel):
    at: datetime
    user_id: str | None
    kind: str
    data: dict
    text: str


class EnquiryServiceOut(BaseModel):
    service_id: str
    name: str


class EnquiryListItem(BaseModel):
    id: str
    reference: str
    name: str
    phone_e164: str
    services: list[EnquiryServiceOut]
    area: str
    status: Status
    source: Source
    assigned_to: str | None
    created_at: datetime


class EnquiryDetail(EnquiryListItem):
    phone_raw: str
    relationship: Relationship
    preferred_start: PreferredStart | None
    note: str
    not_proceeding_reason: str | None
    consent: bool
    language: str
    first_contacted_at: datetime | None
    closed_at: datetime | None
    events: list[EnquiryEventOut]


class EnquiryUpdate(BaseModel):
    """Only fields that are present change. `assigned_to: null` un-assigns."""

    status: Status | None = None
    assigned_to: str | None = None
    reason: Clean | None = Field(default=None, max_length=300)


class NoteIn(BaseModel):
    text: Clean = Field(min_length=1, max_length=1000)
