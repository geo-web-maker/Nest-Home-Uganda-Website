import asyncio
from datetime import date
from uuid import uuid4

import pytest
from beanie import PydanticObjectId

from app.core.deps import Principal
from app.core.errors import Conflict
from app.core.storage import Bucket
from app.modules.billing import repository, service
from app.modules.billing.models import BillTo, CareRecipient, Invoice, InvoiceItem, Payment
from app.modules.billing.schemas import BillToIn, CareRecipientIn, InvoiceIn, ItemIn, PaymentIn


@pytest.mark.asyncio
async def test_50_concurrent_reference_allocations_are_distinct_and_gap_free(mongo):
    values = await asyncio.gather(*(repository.next_reference("invoice", 2026) for _ in range(50)))
    sequences = sorted(int(value.rsplit("-", 1)[1]) for value in values)
    assert len(set(values)) == 50
    assert sequences == list(range(sequences[0], sequences[0] + 50))


def make_invoice(status="issued", balance=100000):
    return Invoice(
        reference="BHC-INV-2026-9001",
        status=status,
        bill_to=BillTo(name="Test Client"),
        issue_date=date(2026, 11, 13),
        due_date=date(2026, 11, 20),
        total_ugx=100000,
        paid_ugx=100000 - balance,
        balance_ugx=balance,
        created_by=PydanticObjectId(),
    )


def payment_body(amount, key=None, ref="TX-001"):
    return PaymentIn(
        amount_ugx=amount,
        method="mtn_momo",
        payer_reference=ref,
        paid_on=date(2026, 11, 13),
        idempotency_key=key or str(uuid4()),
    )


@pytest.mark.asyncio
async def test_concurrent_payments_cannot_overpay(mongo, monkeypatch):
    async def store(key, data, practice=False):
        return Bucket.PRIVATE.value, False

    monkeypatch.setattr(service, "_store_pdf", store)
    monkeypatch.setattr(service.render, "render_pdf", lambda *a, **kw: b"%PDF-1.7 test")
    invoice = make_invoice(balance=100000)
    await invoice.insert()
    principal = Principal(str(PydanticObjectId()), frozenset({"billing:write"}), False)
    results = await asyncio.gather(
        service.record_payment(invoice, payment_body(60000, ref="TX-A"), principal, None),
        service.record_payment(invoice, payment_body(60000, ref="TX-B"), principal, None),
        return_exceptions=True,
    )
    assert sum(not isinstance(value, Exception) for value in results) == 1
    refreshed = await Invoice.get(invoice.id)
    assert refreshed.balance_ugx == 40000
    assert refreshed.paid_ugx == 60000


@pytest.mark.asyncio
async def test_idempotent_retry_creates_one_receipt(mongo, monkeypatch):
    async def store(key, data, practice=False):
        return Bucket.PRIVATE.value, False

    monkeypatch.setattr(service, "_store_pdf", store)
    monkeypatch.setattr(service.render, "render_pdf", lambda *a, **kw: b"%PDF-1.7 test")
    invoice = make_invoice()
    await invoice.insert()
    principal = Principal(str(PydanticObjectId()), frozenset({"billing:write"}), False)
    body = payment_body(25000)
    first, created = await service.record_payment(invoice, body, principal, None)
    second, retried = await service.record_payment(
        await Invoice.get(invoice.id), body, principal, None
    )
    assert created is True and retried is False
    assert first.id == second.id
    assert await Payment.find(Payment.invoice_id == invoice.id).count() == 1


@pytest.mark.asyncio
async def test_payment_exact_balance_marks_invoice_paid(mongo, monkeypatch):
    async def store(key, data, practice=False):
        return Bucket.PRIVATE.value, False

    monkeypatch.setattr(service, "_store_pdf", store)
    monkeypatch.setattr(service.render, "render_pdf", lambda *a, **kw: b"%PDF-1.7 test")
    invoice = make_invoice()
    await invoice.insert()
    principal = Principal(str(PydanticObjectId()), frozenset({"billing:write"}), False)
    await service.record_payment(invoice, payment_body(100000), principal, None)
    refreshed = await Invoice.get(invoice.id)
    assert refreshed.status == "paid"
    assert refreshed.balance_ugx == 0


@pytest.mark.asyncio
async def test_duplicate_payer_reference_is_refused(mongo, monkeypatch):
    async def store(key, data, practice=False):
        return Bucket.PRIVATE.value, False

    monkeypatch.setattr(service, "_store_pdf", store)
    monkeypatch.setattr(service.render, "render_pdf", lambda *a, **kw: b"%PDF-1.7 test")
    principal = Principal(str(PydanticObjectId()), frozenset({"billing:write"}), False)
    first = make_invoice()
    second = make_invoice()
    second.reference = "BHC-INV-2026-9002"
    await first.insert()
    await second.insert()
    await service.record_payment(first, payment_body(10000, ref="SAME-REF"), principal, None)
    with pytest.raises(Conflict):
        await service.record_payment(second, payment_body(10000, ref="SAME-REF"), principal, None)


@pytest.mark.asyncio
async def test_draft_invoice_cannot_accept_payment(mongo):
    invoice = make_invoice(status="draft")
    await invoice.insert()
    principal = Principal(str(PydanticObjectId()), frozenset({"billing:write"}), False)
    with pytest.raises(Conflict):
        await service.record_payment(invoice, payment_body(10000), principal, None)


def make_draft():
    return Invoice(
        status="draft",
        bill_to=BillTo(name="Test Client"),
        care_recipient=CareRecipient(name="Mrs A Nakato"),
        items=[
            InvoiceItem(
                description="Home care", quantity=2, unit_price_ugx=100000, amount_ugx=200000
            )
        ],
        total_ugx=200000,
        balance_ugx=200000,
        issue_date=date(2026, 11, 13),
        due_date=date(2026, 11, 20),
        created_by=PydanticObjectId(),
    )


@pytest.mark.asyncio
async def test_issue_seals_both_pdf_layouts_and_failed_issue_stays_draft(mongo, monkeypatch):
    async def store(key, data, practice=False):
        return Bucket.PRIVATE.value, False

    monkeypatch.setattr(service, "_store_pdf", store)
    monkeypatch.setattr(
        service.render,
        "render_pdf",
        lambda snapshot, digest, layout, **kw: b"%PDF " + layout.encode(),
    )
    principal = Principal(str(PydanticObjectId()), frozenset({"billing:write"}), False)
    invoice = make_draft()
    await invoice.insert()
    issued = await service.issue_invoice(invoice, principal, None)
    assert issued.status == "issued"
    assert set(issued.sealed["renditions"]) == {"ledger", "slip"}
    assert all(len(item["pdf_sha256"]) == 64 for item in issued.sealed["renditions"].values())
    assert (
        issued.sealed["content_hash"]
        == __import__("hashlib").sha256(issued.sealed["snapshot_json"].encode("utf-8")).hexdigest()
    )

    failed = make_draft()
    await failed.insert()

    def fail_render(*args, **kwargs):
        raise RuntimeError("renderer failure")

    monkeypatch.setattr(service.render, "render_pdf", fail_render)
    with pytest.raises(RuntimeError):
        await service.issue_invoice(failed, principal, None)
    refreshed = await Invoice.get(failed.id)
    assert refreshed.status == "draft"
    assert refreshed.reference is None
    assert refreshed.sealed == {}


@pytest.mark.asyncio
async def test_issued_invoice_cannot_be_edited_or_deleted(mongo, monkeypatch):
    async def store(key, data, practice=False):
        return Bucket.PRIVATE.value, False

    monkeypatch.setattr(service, "_store_pdf", store)
    monkeypatch.setattr(service.render, "render_pdf", lambda *args, **kwargs: b"%PDF test")
    principal = Principal(str(PydanticObjectId()), frozenset({"billing:write"}), False)
    invoice = make_draft()
    await invoice.insert()
    issued = await service.issue_invoice(invoice, principal, None)
    body = InvoiceIn(
        bill_to=BillToIn(name="Changed"),
        care_recipient=CareRecipientIn(),
        items=[ItemIn(description="Care", quantity=1, unit_price_ugx=200000)],
        issue_date=date(2026, 11, 13),
        due_date=date(2026, 11, 20),
    )
    with pytest.raises(Conflict):
        await service.update_draft(issued, body, principal, None)
    with pytest.raises(Conflict):
        await service.delete_draft(issued, principal, None)


@pytest.mark.asyncio
async def test_only_latest_payment_can_be_voided_and_invoice_recomputes(mongo, monkeypatch):
    async def store(key, data, practice=False):
        return Bucket.PRIVATE.value, False

    monkeypatch.setattr(service, "_store_pdf", store)
    monkeypatch.setattr(service.render, "render_pdf", lambda *args, **kwargs: b"%PDF test")
    principal = Principal(
        str(PydanticObjectId()), frozenset({"billing:write", "billing:void"}), False
    )
    invoice = make_invoice(balance=100000)
    await invoice.insert()
    first, _ = await service.record_payment(
        invoice, payment_body(20000, ref="FIRST"), principal, None
    )
    second, _ = await service.record_payment(
        await Invoice.get(invoice.id), payment_body(30000, ref="SECOND"), principal, None
    )
    with pytest.raises(Conflict):
        await service.void_payment(first, "Duplicate payment", principal, None)
    await service.void_payment(second, "Duplicate payment", principal, None)
    refreshed = await Invoice.get(invoice.id)
    assert refreshed.status == "part_paid"
    assert refreshed.paid_ugx == 20000
    assert refreshed.balance_ugx == 80000


@pytest.mark.asyncio
async def test_invoice_cannot_be_voided_with_valid_payments_then_can_after_void(mongo, monkeypatch):
    async def store(key, data, practice=False):
        return Bucket.PRIVATE.value, False

    monkeypatch.setattr(service, "_store_pdf", store)
    monkeypatch.setattr(service.render, "render_pdf", lambda *args, **kwargs: b"%PDF test")
    principal = Principal(
        str(PydanticObjectId()), frozenset({"billing:write", "billing:void"}), False
    )
    invoice = make_invoice(balance=100000)
    invoice.status = "issued"
    invoice.sealed = {
        "content_hash": "a" * 64,
        "snapshot_json": __import__("json").dumps(
            {
                "schema_version": 1,
                "doc_type": "invoice",
                "reference": invoice.reference,
                "currency": "UGX",
                "is_test": False,
                "bill_to": invoice.bill_to.model_dump(),
                "care_recipient": invoice.care_recipient.model_dump(),
                "items": [],
                "total_ugx": invoice.total_ugx,
                "paid_ugx": 0,
                "balance_ugx": invoice.balance_ugx,
                "document_date": invoice.issue_date.isoformat(),
                "due_date": invoice.due_date.isoformat(),
                "payment_instructions": "Client to supply",
                "notes": "",
            },
            sort_keys=True,
            separators=(",", ":"),
        ),
        "bucket": "private",
        "locked": False,
        "renditions": {
            "ledger": {"key": "a", "pdf_sha256": "a" * 64},
            "slip": {"key": "b", "pdf_sha256": "b" * 64},
        },
    }
    await invoice.insert()
    payment, _ = await service.record_payment(
        invoice, payment_body(10000, ref="VOID-TEST"), principal, None
    )
    with pytest.raises(Conflict):
        await service.void_invoice(
            await Invoice.get(invoice.id), "Incorrect invoice", principal, None
        )
    await service.void_payment(payment, "Incorrect payment", principal, None)
    await service.void_invoice(await Invoice.get(invoice.id), "Incorrect invoice", principal, None)
    refreshed = await Invoice.get(invoice.id)
    assert refreshed.status == "void"
    assert refreshed.void["rendition"]["key"].endswith("/void.pdf")


@pytest.mark.asyncio
async def test_billing_index_migration_is_idempotent(mongo):
    from app.migrate import run_migrations

    await run_migrations(mongo)
    await run_migrations(mongo)
    invoice_indexes = await mongo["billing_invoices"].index_information()
    payment_indexes = await mongo["billing_payments"].index_information()
    assert "uq_billing_invoice_reference" in invoice_indexes
    assert "uq_billing_payment_idempotency" in payment_indexes
    assert "uq_billing_valid_payer_reference" in payment_indexes


@pytest.mark.asyncio
async def test_reissue_links_replacement_only_when_new_invoice_is_issued(mongo, monkeypatch):
    async def store(key, data, practice=False):
        return Bucket.PRIVATE.value, False

    monkeypatch.setattr(service, "_store_pdf", store)
    monkeypatch.setattr(service.render, "render_pdf", lambda *args, **kwargs: b"%PDF test")
    principal = Principal(
        str(PydanticObjectId()), frozenset({"billing:write", "billing:void"}), False
    )
    old = make_draft()
    await old.insert()
    old = await service.issue_invoice(old, principal, None)
    old_reference = old.reference
    await service.void_invoice(old, "Incorrect billing details", principal, None)
    body = InvoiceIn(
        bill_to=BillToIn(name="Test Client"),
        care_recipient=CareRecipientIn(name="Mrs A Nakato"),
        items=[ItemIn(description="Home care", quantity=2, unit_price_ugx=100000)],
        issue_date=date(2026, 11, 13),
        due_date=date(2026, 11, 20),
    )
    replacement = await service.create_invoice(principal, body, None)
    replacement.supersedes = old_reference
    await replacement.save()
    replacement = await service.issue_invoice(replacement, principal, None)
    refreshed_old = await Invoice.get(old.id)
    assert replacement.supersedes == old_reference
    assert refreshed_old.superseded_by == replacement.reference
    result = await service.verify_public(old_reference, old.sealed["content_hash"][:16])
    assert result["superseded"] is True
