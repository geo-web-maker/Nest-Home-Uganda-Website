from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any, Literal

from beanie import PydanticObjectId
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel

from app.core.models import TimestampedDocument


def utcnow() -> datetime:
    return datetime.now(UTC)


class BillTo(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    address: str = Field(default="", max_length=300)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=160)


class CareRecipient(BaseModel):
    name: str = Field(default="", max_length=160)
    program: str = Field(default="", max_length=160)


class InvoiceItem(BaseModel):
    description: str = Field(min_length=1, max_length=200)
    service_date_text: str = Field(default="", max_length=80)
    quantity: int = Field(ge=1, le=10000)
    unit_price_ugx: int = Field(ge=0, le=2_000_000_000)
    amount_ugx: int = Field(ge=0)


class BillingEvent(BaseModel):
    type: str
    at: datetime = Field(default_factory=utcnow)
    actor: str = "system"
    detail: dict[str, Any] = Field(default_factory=dict)


class Invoice(TimestampedDocument):
    reference: str | None = None
    status: Literal["draft", "issued", "part_paid", "paid", "void"] = "draft"
    is_test: bool = False
    bill_to: BillTo
    care_recipient: CareRecipient = Field(default_factory=CareRecipient)
    agreement_reference: str | None = None
    enquiry_id: PydanticObjectId | None = None
    items: list[InvoiceItem] = Field(default_factory=list)
    total_ugx: int = 0
    paid_ugx: int = 0
    balance_ugx: int = 0
    currency: Literal["UGX"] = "UGX"
    issue_date: date
    due_date: date
    payment_instructions: str = "Client to supply"
    notes: str = ""
    supersedes: str | None = None
    superseded_by: str | None = None
    sealed: dict[str, Any] = Field(default_factory=dict)
    void: dict[str, Any] | None = None
    events: list[BillingEvent] = Field(default_factory=list)
    created_by: PydanticObjectId

    class Settings:
        name = "billing_invoices"
        indexes = [
            IndexModel(
                [("reference", ASCENDING)],
                unique=True,
                name="uq_billing_invoice_reference",
                partialFilterExpression={"reference": {"$type": "string"}},
            ),
            IndexModel(
                [("status", ASCENDING), ("issue_date", DESCENDING)],
                name="ix_billing_invoice_status_date",
            ),
            IndexModel([("created_at", DESCENDING)], name="ix_billing_invoice_created"),
            IndexModel([("bill_to.name", ASCENDING)], name="ix_billing_invoice_bill_to"),
        ]


class Payment(TimestampedDocument):
    reference: str
    invoice_id: PydanticObjectId
    invoice_reference: str
    status: Literal["valid", "void"] = "valid"
    is_test: bool = False
    amount_ugx: int = Field(gt=0)
    method: Literal["mtn_momo", "airtel_money", "bank_transfer", "cash", "cheque", "other"]
    payer_reference: str = ""
    paid_on: date
    idempotency_key: str
    received_by: PydanticObjectId
    invoice_total_ugx: int
    paid_before_ugx: int
    balance_after_ugx: int
    sealed: dict[str, Any] = Field(default_factory=dict)
    void: dict[str, Any] | None = None
    events: list[BillingEvent] = Field(default_factory=list)

    class Settings:
        name = "billing_payments"
        indexes = [
            IndexModel(
                [("reference", ASCENDING)], unique=True, name="uq_billing_payment_reference"
            ),
            IndexModel(
                [("invoice_id", ASCENDING), ("idempotency_key", ASCENDING)],
                unique=True,
                name="uq_billing_payment_idempotency",
            ),
            IndexModel(
                [("invoice_id", ASCENDING), ("created_at", DESCENDING)],
                name="ix_billing_payment_invoice",
            ),
            IndexModel(
                [("method", ASCENDING), ("payer_reference", ASCENDING)],
                unique=True,
                name="uq_billing_valid_payer_reference",
                partialFilterExpression={"payer_reference": {"$gt": ""}, "status": "valid"},
            ),
        ]
