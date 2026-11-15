import pytest
from beanie import PydanticObjectId

from app.core.deps import Principal
from app.core.errors import Conflict
from app.core.storage import Bucket
from app.modules.billing import repository, service
from app.modules.billing.models import BillingDeletion, Invoice, Payment
from tests.conftest import auth, make_token
from tests.test_db_billing import make_draft, payment_body

PRINCIPAL = Principal(str(PydanticObjectId()), frozenset({"billing:write", "billing:void"}), False)


@pytest.fixture
def fake_pdfs(monkeypatch):
    async def store(key, data, practice=False):
        return Bucket.PRIVATE.value, False

    monkeypatch.setattr(service, "_store_pdf", store)
    monkeypatch.setattr(
        service.render, "render_pdf", lambda snapshot, digest, layout, **kw: b"%PDF " + layout.encode()
    )


def test_reference_parsing_and_storage_folder():
    assert repository.parse_reference("BHC-INV-2026-0007") == ("invoice", 2026, False, 7)
    assert repository.parse_reference("TEST-RCT-2026-0003") == ("receipt", 2026, True, 3)
    with pytest.raises(ValueError):
        repository.parse_reference("XYZ-INV-2026-0001")
    assert repository.storage_ref("BHC-INV-2026-0007", 0) == "BHC-INV-2026-0007"
    assert repository.storage_ref("BHC-INV-2026-0007", 2) == "BHC-INV-2026-0007-g2"


@pytest.mark.asyncio
async def test_released_number_is_reused_lowest_first_with_new_generation(mongo):
    first, g0 = await repository.allocate_reference("invoice", 2031)
    second, _ = await repository.allocate_reference("invoice", 2031)
    third, _ = await repository.allocate_reference("invoice", 2031)
    assert g0 == 0
    await repository.release_reference(third, 0)
    await repository.release_reference(second, 0)
    reused, generation = await repository.allocate_reference("invoice", 2031)
    assert (reused, generation) == (second, 1)
    again, _ = await repository.allocate_reference("invoice", 2031)
    assert again == third
    fresh, generation = await repository.allocate_reference("invoice", 2031)
    assert generation == 0
    assert int(fresh[-4:]) == int(third[-4:]) + 1
    assert first != fresh


@pytest.mark.asyncio
async def test_deleting_latest_receipt_restores_invoice_and_frees_number(mongo, fake_pdfs):
    invoice = make_draft()
    await invoice.insert()
    invoice = await service.issue_invoice(invoice, PRINCIPAL, None)
    payment, _ = await service.record_payment(
        await Invoice.get(invoice.id), payment_body(40000, ref="A1"), PRINCIPAL, None
    )
    result = await service.delete_payment(payment, "Entered by mistake", PRINCIPAL, None)
    assert result["number_released"] is True

    refreshed = await Invoice.get(invoice.id)
    assert refreshed.status == "issued"
    assert refreshed.paid_ugx == 0
    assert refreshed.balance_ugx == refreshed.total_ugx
    assert await Payment.get(payment.id) is None

    record = await BillingDeletion.find_one(BillingDeletion.reference == payment.reference)
    assert record is not None
    assert record.reason == "Entered by mistake"
    assert record.deleted_by == PRINCIPAL.user_id
    assert record.snapshot["reference"] == payment.reference

    replacement, _ = await service.record_payment(
        refreshed, payment_body(40000, ref="A2"), PRINCIPAL, None
    )
    assert replacement.reference == payment.reference
    assert replacement.number_generation == 1
    assert replacement.storage_ref == f"{payment.reference}-g1"


@pytest.mark.asyncio
async def test_only_latest_valid_receipt_can_be_deleted(mongo, fake_pdfs):
    invoice = make_draft()
    await invoice.insert()
    invoice = await service.issue_invoice(invoice, PRINCIPAL, None)
    first, _ = await service.record_payment(
        await Invoice.get(invoice.id), payment_body(10000, ref="B1"), PRINCIPAL, None
    )
    await service.record_payment(
        await Invoice.get(invoice.id), payment_body(20000, ref="B2"), PRINCIPAL, None
    )
    with pytest.raises(Conflict):
        await service.delete_payment(first, "Wrong order", PRINCIPAL, None)
    assert await Payment.get(first.id) is not None
    assert await BillingDeletion.find(BillingDeletion.reference == first.reference).count() == 0


@pytest.mark.asyncio
async def test_invoice_delete_needs_receipts_gone_then_frees_number(mongo, fake_pdfs):
    invoice = make_draft()
    await invoice.insert()
    invoice = await service.issue_invoice(invoice, PRINCIPAL, None)
    payment, _ = await service.record_payment(
        await Invoice.get(invoice.id), payment_body(5000, ref="C1"), PRINCIPAL, None
    )
    with pytest.raises(Conflict):
        await service.delete_invoice(await Invoice.get(invoice.id), "Test", PRINCIPAL, None)

    await service.delete_payment(payment, "Test receipt removed", PRINCIPAL, None)
    live = await Invoice.get(invoice.id)
    result = await service.delete_invoice(live, "Test invoice removed", PRINCIPAL, None)
    assert result["number_released"] is True
    assert await Invoice.get(invoice.id) is None
    assert await BillingDeletion.find(BillingDeletion.kind == "invoice").count() == 1

    next_draft = make_draft()
    await next_draft.insert()
    reissued = await service.issue_invoice(next_draft, PRINCIPAL, None)
    assert reissued.reference == invoice.reference
    assert reissued.number_generation == 1


@pytest.mark.asyncio
async def test_draft_cannot_use_issued_delete(mongo):
    draft = make_draft()
    await draft.insert()
    with pytest.raises(Conflict):
        await service.delete_invoice(draft, "Not issued yet", PRINCIPAL, None)


@pytest.mark.asyncio
async def test_delete_routes_require_totp_and_scope(client, mongo):
    for path in (
        "/api/v1/admin/billing/invoices/not-an-object-id/delete",
        "/api/v1/admin/billing/payments/not-an-object-id/delete",
    ):
        body = {"reason": "Removing a test record"}
        assert (
            await client.post(path, json=body, headers=auth(make_token(["billing:void"])))
        ).status_code == 403
        assert (
            await client.post(path, json=body, headers=auth(make_token(["billing:write"])))
        ).status_code == 403
    listing = "/api/v1/admin/billing/deletions"
    assert (await client.get(listing, headers=auth(make_token(["billing:read"])))).status_code == 403
    assert (await client.get(listing, headers=auth(make_token(["billing:void"])))).status_code == 200
