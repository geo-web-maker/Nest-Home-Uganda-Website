"""Indexes for immutable invoice and receipt records."""
from pymongo import ASCENDING, DESCENDING
from pymongo.asynchronous.database import AsyncDatabase


async def up(db: AsyncDatabase) -> None:
    await db["billing_invoices"].create_index(
        [("reference", ASCENDING)], unique=True, name="uq_billing_invoice_reference",
        partialFilterExpression={"reference": {"$type": "string"}},
    )
    await db["billing_invoices"].create_index(
        [("status", ASCENDING), ("issue_date", DESCENDING)], name="ix_billing_invoice_status_date"
    )
    await db["billing_invoices"].create_index(
        [("created_at", DESCENDING)], name="ix_billing_invoice_created"
    )
    await db["billing_invoices"].create_index(
        [("bill_to.name", ASCENDING)], name="ix_billing_invoice_bill_to"
    )
    await db["billing_payments"].create_index(
        [("reference", ASCENDING)], unique=True, name="uq_billing_payment_reference"
    )
    await db["billing_payments"].create_index(
        [("invoice_id", ASCENDING), ("idempotency_key", ASCENDING)], unique=True,
        name="uq_billing_payment_idempotency",
    )
    await db["billing_payments"].create_index(
        [("invoice_id", ASCENDING), ("created_at", DESCENDING)], name="ix_billing_payment_invoice"
    )
    await db["billing_payments"].create_index(
        [("method", ASCENDING), ("payer_reference", ASCENDING)], unique=True,
        name="uq_billing_valid_payer_reference",
        partialFilterExpression={"status": "valid", "payer_reference": {"$gt": ""}},
    )
