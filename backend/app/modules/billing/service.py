from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import UTC, datetime
from typing import Any

from beanie import PydanticObjectId
from pymongo import ReturnDocument

from app.core.config import get_settings
from app.core.deps import Principal
from app.core.errors import Conflict, NotFound, ValidationFailed
from app.core.storage import Bucket, get_storage
from app.modules.agreements import render as agreement_render
from app.modules.audit import service as audit
from app.modules.billing import render, repository, rules
from app.modules.billing.models import (
    BillingEvent,
    BillTo,
    CareRecipient,
    Invoice,
    InvoiceItem,
    Payment,
)
from app.modules.billing.schemas import InvoiceIn, PaymentIn
from app.modules.notifications.providers import get_email_provider

log = logging.getLogger("app.billing")


def _oid(value: str) -> PydanticObjectId:
    if not PydanticObjectId.is_valid(value):
        raise NotFound("Billing record not found.")
    return PydanticObjectId(value)


def _actor(principal: Principal) -> PydanticObjectId:
    return _oid(principal.user_id)


def _event(doc, kind: str, principal: Principal, detail: dict[str, Any] | None = None) -> None:
    doc.events.append(BillingEvent(type=kind, actor=principal.user_id, detail=detail or {}))


def _verified_snapshot(sealed: dict[str, Any]) -> dict[str, Any]:
    """Load a frozen snapshot only when its canonical SHA-256 still matches."""
    if not isinstance(sealed, dict):
        raise ValueError("Missing sealed document data")
    content_hash = sealed.get("content_hash")
    snapshot_json = sealed.get("snapshot_json")
    if (
        not isinstance(content_hash, str)
        or len(content_hash) != 64
        or any(char not in "0123456789abcdef" for char in content_hash)
        or not isinstance(snapshot_json, str)
    ):
        raise ValueError("Invalid sealed document metadata")
    snapshot = json.loads(snapshot_json)
    if not isinstance(snapshot, dict):
        raise ValueError("Invalid sealed document snapshot")
    digest = rules.snapshot_hash(snapshot)
    if not hmac.compare_digest(digest, content_hash):
        raise ValueError("Sealed document snapshot hash mismatch")
    return snapshot


def _snapshot_invoice(doc: Invoice) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "doc_type": "invoice",
        "reference": doc.reference,
        "currency": "UGX",
        "is_test": doc.is_test,
        "bill_to": doc.bill_to.model_dump(),
        "care_recipient": doc.care_recipient.model_dump(),
        "agreement_reference": doc.agreement_reference or "",
        "items": [item.model_dump() for item in doc.items],
        "total_ugx": doc.total_ugx,
        "paid_ugx": doc.paid_ugx,
        "balance_ugx": doc.balance_ugx,
        "document_date": doc.issue_date.isoformat(),
        "due_date": doc.due_date.isoformat(),
        "payment_instructions": doc.payment_instructions or "Client to supply",
        "notes": doc.notes or "",
    }


def _snapshot_payment(payment: Payment, invoice: Invoice) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "doc_type": "receipt",
        "reference": payment.reference,
        "currency": "UGX",
        "is_test": payment.is_test,
        "bill_to": invoice.bill_to.model_dump(),
        "care_recipient": invoice.care_recipient.model_dump(),
        "items": [item.model_dump() for item in invoice.items],
        "total_ugx": invoice.total_ugx,
        "amount_ugx": payment.amount_ugx,
        "invoice_total_ugx": payment.invoice_total_ugx,
        "paid_before_ugx": payment.paid_before_ugx,
        "balance_after_ugx": payment.balance_after_ugx,
        "document_date": payment.paid_on.isoformat(),
        "paid_on": payment.paid_on.isoformat(),
        "method": payment.method,
        "method_label": payment.method.replace("_", " ").title(),
        "payer_reference": payment.payer_reference,
        "invoice_reference": payment.invoice_reference,
        "receipt_status": "PAID" if payment.balance_after_ugx == 0 else "PART PAID",
    }


async def _store_pdf(key: str, data: bytes, *, practice: bool = False) -> tuple[str, bool]:
    settings = get_settings()
    storage = get_storage()
    if not practice and settings.s3_bucket_signed:
        await storage.put_locked(
            Bucket.SIGNED, key, data, "application/pdf", settings.s3_signed_retention_days
        )
        return Bucket.SIGNED.value, True
    await storage.put(Bucket.PRIVATE, key, data, "application/pdf")
    return Bucket.PRIVATE.value, False


async def _store_renditions(
    kind: str, year: int, reference: str, snapshot: dict[str, Any], digest: str, practice: bool
) -> dict[str, Any]:
    bucket_name = "invoices" if kind == "invoice" else "receipts"
    result: dict[str, Any] = {"renditions": {}}
    try:
        for layout in ("ledger", "slip"):
            data = render.render_pdf(snapshot, digest, layout)
            key = f"billing/{bucket_name}/{year}/{reference}/{layout}.pdf"
            bucket, locked = await _store_pdf(key, data, practice=practice)
            result["bucket"] = bucket
            result["locked"] = locked
            result["renditions"][layout] = {
                "key": key,
                "pdf_sha256": hashlib.sha256(data).hexdigest(),
            }
        return result
    except Exception:
        for rendition in result["renditions"].values():
            try:
                await get_storage().delete(
                    Bucket(result.get("bucket") or "private"), rendition["key"]
                )
            except Exception:
                log.warning("billing rendition cleanup failed after render or storage error")
        raise


async def create_invoice(principal: Principal, body: InvoiceIn, ip_hash: str | None) -> Invoice:
    if body.agreement_reference:
        from app.modules.agreements.models import Agreement

        if await Agreement.find_one(Agreement.reference == body.agreement_reference) is None:
            raise ValidationFailed("The agreement reference does not exist.")
    items, total = (
        rules.compute_items([item.model_dump() for item in body.items]) if body.items else ([], 0)
    )
    enquiry_id = _oid(body.enquiry_id) if body.enquiry_id else None
    if enquiry_id:
        from app.modules.enquiries.models import Enquiry

        if await Enquiry.get(enquiry_id) is None:
            raise ValidationFailed("The enquiry reference does not exist.")
    doc = Invoice(
        bill_to=BillTo(**body.bill_to.model_dump()),
        care_recipient=CareRecipient(**body.care_recipient.model_dump()),
        agreement_reference=body.agreement_reference,
        enquiry_id=enquiry_id,
        items=[InvoiceItem(**item) for item in items],
        total_ugx=total,
        paid_ugx=0,
        balance_ugx=total,
        issue_date=body.issue_date,
        due_date=body.due_date,
        payment_instructions=body.payment_instructions,
        notes=body.notes,
        is_test=body.is_test,
        created_by=_actor(principal),
    )
    _event(doc, "created", principal)
    await doc.insert()
    await audit.record(
        principal,
        "invoice.created",
        "invoice",
        str(doc.id),
        f"draft {str(doc.id)[-6:]}",
        after={"status": "draft", "total_ugx": total},
        ip_hash=ip_hash,
    )
    return doc


def invoice_data(doc: Invoice, payments: list[Payment] | None = None) -> dict[str, Any]:
    return {
        "id": str(doc.id),
        "reference": doc.reference,
        "status": doc.status,
        "is_test": doc.is_test,
        "bill_to": doc.bill_to.model_dump(),
        "care_recipient": doc.care_recipient.model_dump(),
        "agreement_reference": doc.agreement_reference,
        "items": [x.model_dump() for x in doc.items],
        "total_ugx": doc.total_ugx,
        "paid_ugx": doc.paid_ugx,
        "balance_ugx": doc.balance_ugx,
        "currency": doc.currency,
        "issue_date": doc.issue_date.isoformat(),
        "due_date": doc.due_date.isoformat(),
        "payment_instructions": doc.payment_instructions,
        "notes": doc.notes,
        "supersedes": doc.supersedes,
        "superseded_by": doc.superseded_by,
        "sealed": doc.sealed,
        "void": doc.void,
        "events": [event.model_dump(mode="json") for event in doc.events],
        "payments": [payment_data(p) for p in payments or []],
        "created_at": doc.created_at.isoformat(),
    }


def payment_data(doc: Payment) -> dict[str, Any]:
    return {
        "id": str(doc.id),
        "reference": doc.reference,
        "invoice_id": str(doc.invoice_id),
        "invoice_reference": doc.invoice_reference,
        "status": doc.status,
        "is_test": doc.is_test,
        "amount_ugx": doc.amount_ugx,
        "method": doc.method,
        "payer_reference": doc.payer_reference,
        "paid_on": doc.paid_on.isoformat(),
        "invoice_total_ugx": doc.invoice_total_ugx,
        "paid_before_ugx": doc.paid_before_ugx,
        "balance_after_ugx": doc.balance_after_ugx,
        "sealed": doc.sealed,
        "void": doc.void,
        "events": [event.model_dump(mode="json") for event in doc.events],
    }


async def get_invoice(invoice_id: str) -> Invoice:
    oid = _oid(invoice_id)
    doc = await Invoice.get(oid)
    if doc is None:
        raise NotFound("Invoice not found.")
    return doc


async def get_payment(payment_id: str) -> Payment:
    oid = _oid(payment_id)
    doc = await Payment.get(oid)
    if doc is None:
        raise NotFound("Receipt not found.")
    return doc


async def update_draft(
    doc: Invoice, body: InvoiceIn, principal: Principal, ip_hash: str | None
) -> Invoice:
    rules.assert_mutable(doc.status)
    items, total = (
        rules.compute_items([item.model_dump() for item in body.items]) if body.items else ([], 0)
    )
    if body.agreement_reference:
        from app.modules.agreements.models import Agreement

        if await Agreement.find_one(Agreement.reference == body.agreement_reference) is None:
            raise ValidationFailed("The agreement reference does not exist.")
    if body.enquiry_id:
        from app.modules.enquiries.models import Enquiry

        if await Enquiry.get(_oid(body.enquiry_id)) is None:
            raise ValidationFailed("The enquiry reference does not exist.")
    before = {"status": doc.status, "total_ugx": doc.total_ugx}
    now = datetime.now(UTC)
    event = BillingEvent(type="updated", actor=principal.user_id).model_dump()
    update = await Invoice.get_pymongo_collection().update_one(
        {"_id": doc.id, "status": "draft"},
        {
            "$set": {
                "bill_to": BillTo(**body.bill_to.model_dump()).model_dump(),
                "care_recipient": CareRecipient(**body.care_recipient.model_dump()).model_dump(),
                "agreement_reference": body.agreement_reference,
                "enquiry_id": _oid(body.enquiry_id) if body.enquiry_id else None,
                "items": items,
                "total_ugx": total,
                "balance_ugx": total - doc.paid_ugx,
                "issue_date": body.issue_date,
                "due_date": body.due_date,
                "payment_instructions": body.payment_instructions,
                "notes": body.notes,
                "is_test": body.is_test,
                "updated_at": now,
            },
            "$push": {"events": event},
        },
    )
    if update.modified_count != 1:
        raise Conflict("This invoice is no longer a draft. Reload the record.")
    await doc.sync()
    await audit.record(
        principal,
        "invoice.updated",
        "invoice",
        str(doc.id),
        "draft",
        before=before,
        after={"status": doc.status, "total_ugx": doc.total_ugx},
        ip_hash=ip_hash,
    )
    return doc


async def delete_draft(doc: Invoice, principal: Principal, ip_hash: str | None) -> None:
    rules.assert_mutable(doc.status)
    item_id = str(doc.id)
    result = await Invoice.get_pymongo_collection().delete_one({"_id": doc.id, "status": "draft"})
    if result.deleted_count != 1:
        raise Conflict("This invoice is no longer a draft. Reload the record.")
    await audit.record(
        principal,
        "invoice.deleted",
        "invoice",
        item_id,
        f"draft {item_id[-6:]}",
        before={"status": "draft", "total_ugx": doc.total_ugx},
        ip_hash=ip_hash,
    )


async def issue_invoice(doc: Invoice, principal: Principal, ip_hash: str | None) -> Invoice:
    await doc.sync()
    if doc.status != "draft":
        raise Conflict("Only draft invoices can be issued.")
    if not doc.items or doc.total_ugx <= 0:
        raise Conflict(
            "Add at least one invoice item with a total greater than zero before issuing."
        )
    rules.validate_due_date(doc.issue_date, doc.due_date)
    computed, total = rules.compute_items(
        [
            {
                "description": item.description,
                "service_date_text": item.service_date_text,
                "quantity": item.quantity,
                "unit_price_ugx": item.unit_price_ugx,
            }
            for item in doc.items
        ]
    )
    doc.items = [InvoiceItem(**item) for item in computed]
    doc.total_ugx = total
    doc.balance_ugx = max(0, total - doc.paid_ugx)
    year = doc.issue_date.year
    reference = await repository.next_reference("invoice", year, doc.is_test)
    stored: dict[str, Any] | None = None
    committed = False
    try:
        doc.reference = reference
        snapshot = _snapshot_invoice(doc)
        canonical = rules.canonical_snapshot(snapshot)
        digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        stored = await _store_renditions("invoice", year, reference, snapshot, digest, doc.is_test)
        sealed = {
            "schema_version": 1,
            "content_hash": digest,
            "snapshot_json": canonical,
            "sealed_at": datetime.now(UTC).isoformat(),
            **stored,
        }
        event = BillingEvent(
            type="issued", actor=principal.user_id, detail={"content_hash": digest}
        ).model_dump()
        result = await Invoice.get_pymongo_collection().update_one(
            {"_id": doc.id, "status": "draft", "updated_at": doc.updated_at},
            {
                "$set": {
                    "reference": reference,
                    "status": "issued",
                    "items": computed,
                    "total_ugx": total,
                    "balance_ugx": max(0, total - doc.paid_ugx),
                    "sealed": sealed,
                    "updated_at": datetime.now(UTC),
                },
                "$push": {"events": event},
            },
        )
        if result.modified_count != 1:
            raise Conflict("This draft changed while it was being issued. Reload and try again.")
        committed = True
        await doc.sync()
        if doc.supersedes:
            await Invoice.get_pymongo_collection().update_one(
                {"reference": doc.supersedes, "status": "void", "superseded_by": None},
                {"$set": {"superseded_by": reference, "updated_at": datetime.now(UTC)}},
            )
        await audit.record(
            principal,
            "invoice.issued",
            "invoice",
            str(doc.id),
            reference,
            after={"status": "issued", "total_ugx": doc.total_ugx},
            ip_hash=ip_hash,
        )
        return doc
    except Exception:
        if not committed:
            if stored:
                for rendition in stored.get("renditions", {}).values():
                    try:
                        await get_storage().delete(
                            Bucket(stored.get("bucket") or "private"), rendition["key"]
                        )
                    except Exception:
                        log.warning("invoice rendition cleanup failed after unsuccessful issue")
            try:
                await audit.record(
                    principal,
                    "invoice.issue_failed",
                    "invoice",
                    str(doc.id),
                    "draft",
                    after={"status": "draft", "total_ugx": total},
                    ip_hash=ip_hash,
                )
            except Exception:
                log.exception("could not persist invoice issue failure audit")
        raise


async def record_payment(
    doc: Invoice, body: PaymentIn, principal: Principal, ip_hash: str | None
) -> tuple[Payment, bool]:
    existing = await Payment.find_one(
        Payment.invoice_id == doc.id, Payment.idempotency_key == body.idempotency_key
    )
    if existing:
        return existing, False
    rules.assert_payment_allowed(doc.status, doc.balance_ugx, body.amount_ugx)
    if body.payer_reference:
        duplicate = await Payment.find_one(
            Payment.method == body.method,
            Payment.payer_reference == body.payer_reference,
            Payment.status == "valid",
        )
        if duplicate:
            raise Conflict("This payment reference has already been recorded.")

    collection = Invoice.get_pymongo_collection()
    amount = body.amount_ugx
    event = BillingEvent(
        type="payment_recorded", actor=principal.user_id, detail={"amount_ugx": amount}
    ).model_dump()
    updated = await collection.find_one_and_update(
        {
            "_id": doc.id,
            "status": {"$in": ["issued", "part_paid"]},
            "balance_ugx": {"$gte": amount},
        },
        [
            {
                "$set": {
                    "paid_ugx": {"$add": ["$paid_ugx", amount]},
                    "balance_ugx": {"$subtract": ["$balance_ugx", amount]},
                    "status": {
                        "$cond": [
                            {"$eq": [{"$subtract": ["$balance_ugx", amount]}, 0]},
                            "paid",
                            "part_paid",
                        ]
                    },
                    "events": {"$concatArrays": [{"$ifNull": ["$events", []]}, [event]]},
                }
            }
        ],
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        raise Conflict("The balance has changed. Reload and try again.")

    paid_before = int(updated["paid_ugx"]) - amount
    balance_after = int(updated["balance_ugx"])
    payment: Payment | None = None
    stored: dict[str, Any] | None = None
    inserted = False
    try:
        year = body.paid_on.year
        reference = await repository.next_reference("receipt", year, doc.is_test)
        payment = Payment(
            reference=reference,
            invoice_id=doc.id,
            invoice_reference=doc.reference or "",
            is_test=doc.is_test,
            amount_ugx=amount,
            method=body.method,
            payer_reference=body.payer_reference,
            paid_on=body.paid_on,
            idempotency_key=body.idempotency_key,
            received_by=_actor(principal),
            invoice_total_ugx=doc.total_ugx,
            paid_before_ugx=paid_before,
            balance_after_ugx=balance_after,
        )
        snapshot = _snapshot_payment(payment, doc)
        canonical = rules.canonical_snapshot(snapshot)
        digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        stored = await _store_renditions("receipt", year, reference, snapshot, digest, doc.is_test)
        payment.sealed = {
            "schema_version": 1,
            "content_hash": digest,
            "snapshot_json": canonical,
            "sealed_at": datetime.now(UTC).isoformat(),
            **stored,
        }
        payment.events.append(BillingEvent(type="recorded", actor=principal.user_id))
        await payment.insert()
        inserted = True
        await audit.record(
            principal,
            "payment.recorded",
            "payment",
            str(payment.id),
            reference,
            after={"status": "valid", "amount_ugx": amount},
            ip_hash=ip_hash,
        )
        return payment, True
    except Exception as exc:
        if inserted and payment is not None:
            await payment.delete()
        if stored:
            for rendition in stored.get("renditions", {}).values():
                try:
                    await get_storage().delete(
                        Bucket(stored.get("bucket") or "private"), rendition["key"]
                    )
                except Exception:
                    log.warning("could not clean up rolled-back receipt PDF")
        rollback_event = BillingEvent(
            type="payment_rollback", actor=principal.user_id, detail={"amount_ugx": amount}
        ).model_dump()
        await collection.update_one(
            {"_id": doc.id},
            [
                {
                    "$set": {
                        "paid_ugx": {"$subtract": ["$paid_ugx", amount]},
                        "balance_ugx": {"$add": ["$balance_ugx", amount]},
                        "status": {
                            "$cond": [
                                {"$eq": [{"$subtract": ["$paid_ugx", amount]}, 0]},
                                "issued",
                                {
                                    "$cond": [
                                        {"$eq": [{"$add": ["$balance_ugx", amount]}, 0]},
                                        "paid",
                                        "part_paid",
                                    ]
                                },
                            ]
                        },
                        "events": {
                            "$concatArrays": [{"$ifNull": ["$events", []]}, [rollback_event]]
                        },
                    }
                }
            ],
        )
        try:
            await audit.record(
                principal,
                "payment.rollback",
                "payment",
                None,
                "receipt allocation failed",
                after={"status": "rolled_back", "amount_ugx": amount},
                ip_hash=ip_hash,
            )
        except Exception:
            log.exception("could not persist payment rollback audit")
        from pymongo.errors import DuplicateKeyError

        if isinstance(exc, DuplicateKeyError):
            existing = await Payment.find_one(
                Payment.invoice_id == doc.id, Payment.idempotency_key == body.idempotency_key
            )
            if existing:
                return existing, False
            raise Conflict("This payment reference has already been recorded.") from exc
        raise


async def void_payment(
    payment: Payment, reason: str, principal: Principal, ip_hash: str | None
) -> None:
    if payment.status != "valid":
        raise Conflict("This receipt is already void.")
    latest = (
        await Payment.find(Payment.invoice_id == payment.invoice_id, Payment.status == "valid")
        .sort([("created_at", -1), ("_id", -1)])
        .first_or_none()
    )
    if latest is None or latest.id != payment.id:
        raise Conflict(
            "Only the most recent valid payment can be voided. Void later payments first."
        )
    invoice = await Invoice.get(payment.invoice_id)
    if invoice is None:
        raise NotFound("Invoice not found.")
    if not payment.sealed or not payment.sealed.get("snapshot_json"):
        raise Conflict("The receipt is not sealed and cannot be voided.")

    voided_at = datetime.now(UTC).isoformat()
    try:
        snapshot = _verified_snapshot(payment.sealed)
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise Conflict("The sealed receipt snapshot failed its integrity check.") from exc
    void_pdf = render.render_pdf(
        snapshot, payment.sealed["content_hash"], "ledger", voided_at=voided_at
    )
    key = f"billing/receipts/{payment.paid_on.year}/{payment.reference}/void.pdf"
    bucket, locked = await _store_pdf(key, void_pdf, practice=payment.is_test)
    void_data = {
        "voided_at": voided_at,
        "voided_by": principal.user_id,
        "reason": reason,
        "rendition": {
            "key": key,
            "pdf_sha256": hashlib.sha256(void_pdf).hexdigest(),
            "bucket": bucket,
            "locked": locked,
        },
    }
    event = BillingEvent(
        type="voided", actor=principal.user_id, detail={"reason": reason}
    ).model_dump()
    payment_collection = Payment.get_pymongo_collection()
    claimed = await payment_collection.update_one(
        {"_id": payment.id, "status": "valid"},
        {
            "$set": {"status": "void", "void": void_data, "updated_at": datetime.now(UTC)},
            "$push": {"events": event},
        },
    )
    if claimed.modified_count != 1:
        try:
            await get_storage().delete(Bucket(bucket), key)
        except Exception:
            log.warning("could not clean up duplicate receipt VOID rendition")
        raise Conflict("This receipt changed while it was being voided. Reload and try again.")

    invoice_event = BillingEvent(
        type="payment_voided",
        actor=principal.user_id,
        detail={"amount_ugx": payment.amount_ugx},
    ).model_dump()
    now = datetime.now(UTC)
    updated_invoice = await Invoice.get_pymongo_collection().update_one(
        {
            "_id": invoice.id,
            "status": {"$in": ["issued", "part_paid", "paid"]},
            "paid_ugx": {"$gte": payment.amount_ugx},
        },
        [
            {
                "$set": {
                    "paid_ugx": {"$subtract": ["$paid_ugx", payment.amount_ugx]},
                    "balance_ugx": {"$add": ["$balance_ugx", payment.amount_ugx]},
                    "status": {
                        "$cond": [
                            {"$eq": [{"$subtract": ["$paid_ugx", payment.amount_ugx]}, 0]},
                            "issued",
                            "part_paid",
                        ]
                    },
                    "events": {"$concatArrays": [{"$ifNull": ["$events", []]}, [invoice_event]]},
                    "updated_at": now,
                }
            }
        ],
    )
    if updated_invoice.modified_count != 1:
        await payment_collection.update_one(
            {"_id": payment.id, "status": "void"},
            {
                "$set": {"status": "valid", "updated_at": datetime.now(UTC)},
                "$unset": {"void": ""},
                "$pull": {"events": event},
            },
        )
        try:
            await get_storage().delete(Bucket(bucket), key)
        except Exception:
            log.warning("could not clean up receipt VOID rendition after invoice update conflict")
        raise Conflict(
            "The invoice changed while the receipt was being voided. Reload and try again."
        )

    await payment.sync()
    await invoice.sync()
    await audit.record(
        principal,
        "payment.voided",
        "payment",
        str(payment.id),
        payment.reference,
        after={"status": "void", "amount_ugx": payment.amount_ugx},
        ip_hash=ip_hash,
    )


async def void_invoice(
    doc: Invoice, reason: str, principal: Principal, ip_hash: str | None
) -> None:
    if doc.status == "void":
        raise Conflict("This invoice is already void.")
    if doc.status in {"part_paid", "paid"}:
        raise Conflict("Void all valid payments before voiding this invoice.")
    valid_count = await Payment.find(
        Payment.invoice_id == doc.id, Payment.status == "valid"
    ).count()
    if not rules.can_void_invoice(doc.status, valid_count):
        raise Conflict("Only an unpaid issued invoice can be voided.")
    voided_at = datetime.now(UTC).isoformat()
    if not doc.sealed or not doc.sealed.get("snapshot_json") or not doc.sealed.get("content_hash"):
        raise Conflict("The invoice is not sealed and cannot be voided.")
    try:
        snapshot = _verified_snapshot(doc.sealed)
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise Conflict("The sealed invoice snapshot failed its integrity check.") from exc
    pdf = render.render_pdf(snapshot, doc.sealed["content_hash"], "ledger", voided_at=voided_at)
    key = f"billing/invoices/{doc.issue_date.year}/{doc.reference}/void.pdf"
    bucket, locked = await _store_pdf(key, pdf, practice=doc.is_test)
    void_data = {
        "voided_at": voided_at,
        "voided_by": principal.user_id,
        "reason": reason,
        "rendition": {
            "key": key,
            "pdf_sha256": hashlib.sha256(pdf).hexdigest(),
            "bucket": bucket,
            "locked": locked,
        },
    }
    event = BillingEvent(
        type="voided", actor=principal.user_id, detail={"reason": reason}
    ).model_dump()
    result = await Invoice.get_pymongo_collection().update_one(
        {"_id": doc.id, "status": "issued", "paid_ugx": 0, "balance_ugx": doc.total_ugx},
        {
            "$set": {"status": "void", "void": void_data, "updated_at": datetime.now(UTC)},
            "$push": {"events": event},
        },
    )
    if result.modified_count != 1:
        try:
            await get_storage().delete(Bucket(bucket), key)
        except Exception:
            log.warning("could not clean up unsuccessful invoice VOID rendition")
        raise Conflict("The invoice changed while it was being voided. Reload and try again.")
    await doc.sync()
    await audit.record(
        principal,
        "invoice.voided",
        "invoice",
        str(doc.id),
        doc.reference,
        after={"status": "void"},
        ip_hash=ip_hash,
    )


async def get_pdf(doc: Invoice | Payment, layout: str, original: bool = False) -> bytes:
    if layout not in {"ledger", "slip"}:
        raise ValidationFailed("Layout must be ledger or slip.")
    sealed = doc.sealed
    if doc.status == "void" and not original and doc.void and doc.void.get("rendition"):
        rendition = doc.void["rendition"]
        bucket = Bucket(rendition.get("bucket") or sealed.get("bucket") or "private")
        data = await get_storage().get(bucket, rendition["key"])
        expected = rendition["pdf_sha256"]
    else:
        rendition = sealed.get("renditions", {}).get(layout)
        if not rendition:
            raise NotFound("The requested PDF is not available.")
        bucket = Bucket(sealed.get("bucket") or "private")
        data = await get_storage().get(bucket, rendition["key"])
        expected = rendition["pdf_sha256"]
    if not expected or not hmac.compare_digest(hashlib.sha256(data).hexdigest(), expected):
        try:
            await audit.record_system_event(
                action=(
                    "invoice.integrity_failed"
                    if isinstance(doc, Invoice)
                    else "payment.integrity_failed"
                ),
                message="A sealed billing PDF failed its SHA-256 integrity check.",
                severity="critical",
                source="billing",
                outcome="failure",
                details={
                    "document_type": "invoice" if isinstance(doc, Invoice) else "payment",
                    "reference": doc.reference,
                },
            )
        except Exception:
            log.exception("could not persist billing integrity failure audit")
        raise Conflict("The sealed billing document failed its integrity check.")
    return data


async def verify_public(reference: str, code: str) -> dict[str, Any]:
    invoice = await Invoice.find_one(Invoice.reference == reference)
    payment = await Payment.find_one(Payment.reference == reference)
    doc = invoice or payment
    if doc is None or not doc.sealed:
        raise NotFound("No document matches this link.")
    try:
        snapshot = _verified_snapshot(doc.sealed)
    except (TypeError, ValueError, json.JSONDecodeError):
        raise NotFound("No document matches this link.") from None
    content_hash = doc.sealed["content_hash"]
    expected = agreement_render.verify_code(content_hash)
    if not hmac.compare_digest(expected, code):
        raise NotFound("No document matches this link.")
    expected_type = "invoice" if invoice else "receipt"
    bill_to = snapshot.get("bill_to")
    issued = snapshot.get("document_date")
    amount = snapshot.get("total_ugx") if invoice else snapshot.get("amount_ugx")
    renditions = doc.sealed.get("renditions")
    if (
        snapshot.get("reference") != doc.reference
        or snapshot.get("doc_type") != expected_type
        or not isinstance(bill_to, dict)
        or not isinstance(issued, str)
        or type(amount) is not int
        or amount < 0
        or not isinstance(renditions, dict)
    ):
        raise NotFound("No document matches this link.")
    hashes: dict[str, str] = {}
    for layout in ("ledger", "slip"):
        rendition = renditions.get(layout)
        digest = rendition.get("pdf_sha256") if isinstance(rendition, dict) else None
        if (
            not isinstance(digest, str)
            or len(digest) != 64
            or any(char not in "0123456789abcdef" for char in digest)
        ):
            raise NotFound("No document matches this link.")
        hashes[layout] = digest
    status = "void" if doc.status == "void" else "valid"
    return {
        "valid": True,
        "status": status,
        "superseded": bool(invoice and invoice.superseded_by),
        "doc_type": "invoice" if invoice else "receipt",
        "reference": doc.reference,
        "practice": bool(doc.is_test),
        "issued_on": issued,
        "amount_ugx": amount,
        "client_name": agreement_render.mask_name(bill_to.get("name")),
        "voided_at": (doc.void or {}).get("voided_at"),
        "content_hash": doc.sealed["content_hash"],
        "pdf_sha256": hashes,
    }


async def email_document(doc: Invoice | Payment, principal: Principal, ip_hash: str | None) -> None:
    if not doc.sealed:
        raise Conflict("Issue the document before emailing it.")
    if doc.status == "void":
        raise Conflict("A void document cannot be emailed as a current invoice or receipt.")
    email_addr = doc.bill_to.email if isinstance(doc, Invoice) else ""
    if isinstance(doc, Payment):
        invoice = await Invoice.get(doc.invoice_id)
        email_addr = invoice.bill_to.email if invoice else ""
    if not email_addr:
        raise ValidationFailed("Add a client email address before sending this document.")
    pdf = await get_pdf(doc, "ledger", original=True)
    url = agreement_render.verify_url(doc.reference, doc.sealed["content_hash"])
    doc_type = "invoice" if isinstance(doc, Invoice) else "receipt"
    amount = doc.total_ugx if isinstance(doc, Invoice) else doc.amount_ugx
    subject = f"Bloomwell {doc_type} {doc.reference}"
    plain = f"Please find your {doc_type} attached. Amount: {render.money(amount)}. Verify: {url}"
    body = (
        f"<p>Please find your {doc_type} attached.</p><p>{render.money(amount)}</p>"
        f'<p><a href="{url}">Verify this document</a></p>'
    )
    if doc.is_test:
        subject = "[PRACTICE] " + subject
    result = await get_email_provider().send(
        [email_addr],
        subject,
        body,
        plain,
        attachments=[
            {
                "filename": f"{doc.reference}-ledger.pdf",
                "content_type": "application/pdf",
                "data": pdf,
            }
        ],
    )
    if not result.ok or getattr(result, "provider_message_id", None) == "console":
        raise Conflict(
            "The mail service did not accept the billing document with its PDF attachment."
        )
    masked = (email_addr[:1] + "***@" + email_addr.split("@")[-1]) if "@" in email_addr else "***"
    _event(doc, "emailed", principal, {"destination": masked})
    await doc.save()
    action = "invoice.emailed" if isinstance(doc, Invoice) else "payment.emailed"
    await audit.record(
        principal,
        action,
        doc_type,
        str(doc.id),
        doc.reference,
        after={"status": doc.status, "destination": masked},
        ip_hash=ip_hash,
    )


async def purge_practice_billing(older_than_days: int = 3) -> int:
    """Remove only practice invoices, receipts and their private PDF renditions."""
    from datetime import timedelta

    cutoff = datetime.now(UTC) - timedelta(days=max(1, older_than_days))
    invoices = await Invoice.find(Invoice.is_test == True, Invoice.created_at < cutoff).to_list()  # noqa: E712
    payments = await Payment.find(Payment.is_test == True, Payment.created_at < cutoff).to_list()  # noqa: E712
    removed = 0
    for doc in invoices:
        for rendition in (doc.sealed.get("renditions") or {}).values():
            try:
                await get_storage().delete(
                    Bucket(doc.sealed.get("bucket") or "private"), rendition["key"]
                )
            except Exception:
                log.warning("practice invoice PDF cleanup failed for %s", doc.reference)
        if doc.void and doc.void.get("rendition"):
            try:
                await get_storage().delete(
                    Bucket(doc.void["rendition"].get("bucket") or "private"),
                    doc.void["rendition"]["key"],
                )
            except Exception:
                log.warning("practice invoice VOID PDF cleanup failed for %s", doc.reference)
        await doc.delete()
        removed += 1
    for payment in payments:
        for rendition in (payment.sealed.get("renditions") or {}).values():
            try:
                await get_storage().delete(
                    Bucket(payment.sealed.get("bucket") or "private"), rendition["key"]
                )
            except Exception:
                log.warning("practice receipt PDF cleanup failed for %s", payment.reference)
        if payment.void and payment.void.get("rendition"):
            try:
                await get_storage().delete(
                    Bucket(payment.void["rendition"].get("bucket") or "private"),
                    payment.void["rendition"]["key"],
                )
            except Exception:
                log.warning("practice receipt VOID PDF cleanup failed for %s", payment.reference)
        await payment.delete()
        removed += 1
    return removed
