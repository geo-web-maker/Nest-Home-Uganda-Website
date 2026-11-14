from __future__ import annotations

import unicodedata
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator, model_validator


def clean_text(value: str) -> str:
    """Strip control and bidi-override characters; line breaks and tabs become spaces."""
    return "".join(
        " " if ch in "\n\r\t" else ch
        for ch in value
        if (ch in "\n\r\t" or unicodedata.category(ch) != "Cc")
        and not (0x202A <= ord(ch) <= 0x202E or 0x2066 <= ord(ch) <= 0x2069)
    )


class BillToIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=160)
    address: str = Field(default="", max_length=300)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=160)

    @field_validator("name")
    @classmethod
    def sanitise_name(cls, value: str) -> str:
        cleaned = clean_text(value).strip()
        if not cleaned:
            raise ValueError("Client name is required")
        return cleaned

    @field_validator("address", "phone", "email")
    @classmethod
    def sanitise_optional(cls, value: str) -> str:
        return clean_text(value).strip()


class CareRecipientIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(default="", max_length=160)
    program: str = Field(default="", max_length=160)

    @field_validator("name", "program")
    @classmethod
    def sanitise(cls, value: str) -> str:
        return clean_text(value).strip()


class ItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    description: str = Field(min_length=1, max_length=200)
    service_date_text: str = Field(default="", max_length=80)
    quantity: StrictInt = Field(ge=1, le=10000)
    unit_price_ugx: StrictInt = Field(ge=0, le=2_000_000_000)

    @field_validator("description")
    @classmethod
    def sanitise_description(cls, value: str) -> str:
        cleaned = clean_text(value).strip()
        if not cleaned:
            raise ValueError("Item description is required")
        return cleaned

    @field_validator("service_date_text")
    @classmethod
    def sanitise_service_date(cls, value: str) -> str:
        return clean_text(value).strip()


class InvoiceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bill_to: BillToIn
    care_recipient: CareRecipientIn = Field(default_factory=CareRecipientIn)
    agreement_reference: str | None = Field(default=None, max_length=40)
    enquiry_id: str | None = Field(default=None, max_length=30)
    items: list[ItemIn] = Field(default_factory=list, max_length=60)
    issue_date: date
    due_date: date
    payment_instructions: str = Field(default="Client to supply", max_length=600)
    notes: str = Field(default="", max_length=600)
    is_test: bool = False

    @field_validator("payment_instructions", "notes")
    @classmethod
    def sanitise(cls, value: str) -> str:
        return clean_text(value).strip()

    @model_validator(mode="after")
    def date_order(self):
        if self.due_date < self.issue_date:
            raise ValueError("Due date must be on or after the issue date")
        return self


class PaymentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount_ugx: StrictInt = Field(gt=0, le=2_000_000_000)
    method: Literal["mtn_momo", "airtel_money", "bank_transfer", "cash", "cheque", "other"]
    payer_reference: str = Field(default="", max_length=80)
    paid_on: date
    idempotency_key: str = Field(min_length=36, max_length=36)

    @field_validator("payer_reference")
    @classmethod
    def sanitise(cls, value: str) -> str:
        return clean_text(value).strip()

    @field_validator("idempotency_key")
    @classmethod
    def uuid_key(cls, value: str) -> str:
        import uuid

        try:
            uuid.UUID(value)
        except ValueError as exc:
            raise ValueError("Idempotency key must be a UUID") from exc
        return value

    @model_validator(mode="after")
    def method_reference(self):
        if self.method != "cash" and not self.payer_reference:
            raise ValueError("A payer reference is required for this payment method")
        if self.paid_on > date.today():
            raise ValueError("Payment date cannot be in the future")
        return self


class VoidIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=5, max_length=300)

    @field_validator("reason")
    @classmethod
    def sanitise(cls, value: str) -> str:
        cleaned = clean_text(value).strip()
        if len(cleaned) < 5:
            raise ValueError("Void reason must contain at least 5 characters")
        return cleaned
