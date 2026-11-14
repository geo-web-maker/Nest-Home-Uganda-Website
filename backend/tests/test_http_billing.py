import pytest

from app.core.deps import route_required_scopes
from app.registry import API_PREFIX, iter_api_routes
from tests.conftest import auth, make_token


def test_every_admin_billing_route_has_required_scope():
    routes = [
        (path, route)
        for path, route in iter_api_routes()
        if path.startswith(f"{API_PREFIX}/admin/billing")
    ]
    assert routes
    assert all(route_required_scopes(route) for _, route in routes)
    for path, route in routes:
        scopes = route_required_scopes(route)
        assert scopes in {("billing:read",), ("billing:write",), ("billing:void",)}, (path, scopes)


@pytest.mark.asyncio
async def test_billing_scope_matrix_for_invoice_list(client, mongo):
    path = "/api/v1/admin/billing/invoices"
    assert (await client.get(path)).status_code == 401
    no_scope = make_token(["dashboard:view"])
    assert (await client.get(path, headers=auth(no_scope))).status_code == 403
    reader = make_token(["billing:read"])
    assert (await client.get(path, headers=auth(reader))).status_code == 200
    writer = make_token(["billing:write"])
    assert (await client.get(path, headers=auth(writer))).status_code == 403


@pytest.mark.asyncio
async def test_void_route_requires_totp_before_loading_record(client):
    token = make_token(["billing:void"])
    response = await client.post(
        "/api/v1/admin/billing/invoices/not-an-object-id/void",
        json={"reason": "Test void reason"},
        headers=auth(token),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_patch_on_issued_invoice_returns_conflict(client, mongo):
    from datetime import date

    from beanie import PydanticObjectId

    from app.modules.billing.models import BillTo, Invoice

    invoice = Invoice(
        reference="BHC-INV-2026-0088",
        status="issued",
        bill_to=BillTo(name="Test Client"),
        issue_date=date(2026, 11, 13),
        due_date=date(2026, 11, 20),
        total_ugx=1000,
        balance_ugx=1000,
        created_by=PydanticObjectId(),
    )
    await invoice.insert()
    token = make_token(["billing:write"])
    response = await client.patch(
        f"/api/v1/admin/billing/invoices/{invoice.id}",
        json={
            "bill_to": {"name": "Changed"},
            "care_recipient": {"name": "", "program": ""},
            "items": [],
            "issue_date": "2026-11-13",
            "due_date": "2026-11-20",
        },
        headers=auth(token),
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_pdf_download_checks_sha256_and_records_critical_tamper_event(
    client, mongo, monkeypatch
):
    import hashlib
    from datetime import date

    from beanie import PydanticObjectId

    from app.modules.audit.models import AuditLog
    from app.modules.billing import service
    from app.modules.billing.models import BillTo, Invoice

    class MemoryStorage:
        data = b"%PDF-1.7 original"

        async def get(self, bucket, key):
            return self.data

        async def delete(self, bucket, key):
            return None

    storage = MemoryStorage()
    monkeypatch.setattr(service, "get_storage", lambda: storage)
    invoice = Invoice(
        reference="BHC-INV-2026-0089",
        status="issued",
        bill_to=BillTo(name="Test Client"),
        issue_date=date(2026, 11, 13),
        due_date=date(2026, 11, 20),
        total_ugx=1000,
        balance_ugx=1000,
        created_by=PydanticObjectId(),
        sealed={
            "bucket": "private",
            "content_hash": "a" * 64,
            "renditions": {
                "ledger": {
                    "key": "billing/invoices/2026/BHC-INV-2026-0089/ledger.pdf",
                    "pdf_sha256": hashlib.sha256(storage.data).hexdigest(),
                }
            },
        },
    )
    await invoice.insert()
    token = make_token(["billing:read"])
    path = f"/api/v1/admin/billing/invoices/{invoice.id}/pdf?layout=ledger"
    good = await client.get(path, headers=auth(token))
    assert good.status_code == 200
    assert good.content == storage.data
    assert good.headers["Cache-Control"] == "no-store"
    storage.data = b"%PDF-1.7 tampered"
    bad = await client.get(path, headers=auth(token))
    assert bad.status_code == 409
    event = await AuditLog.find_one(AuditLog.action == "invoice.integrity_failed")
    assert event is not None
    assert event.severity == "critical"


@pytest.mark.asyncio
async def test_payment_endpoint_returns_created_then_ok_for_idempotent_retry(
    client, mongo, monkeypatch
):
    from datetime import date
    from uuid import uuid4

    from beanie import PydanticObjectId

    from app.modules.billing import service
    from app.modules.billing.models import BillTo, Invoice, InvoiceItem

    async def store(key, data, *, practice=False):
        from app.core.storage import Bucket

        return Bucket.PRIVATE.value, False

    monkeypatch.setattr(service, "_store_pdf", store)
    monkeypatch.setattr(service.render, "render_pdf", lambda *args, **kwargs: b"%PDF-1.7 test")
    invoice = Invoice(
        reference="BHC-INV-2026-9998",
        status="issued",
        bill_to=BillTo(name="Test Client"),
        items=[
            InvoiceItem(
                description="Home care", quantity=1, unit_price_ugx=100000, amount_ugx=100000
            )
        ],
        total_ugx=100000,
        balance_ugx=100000,
        issue_date=date(2026, 11, 13),
        due_date=date(2026, 11, 20),
        created_by=PydanticObjectId(),
    )
    await invoice.insert()
    token = make_token(["billing:write"])
    body = {
        "amount_ugx": 25000,
        "method": "mtn_momo",
        "payer_reference": "HTTP-TX-1",
        "paid_on": "2026-11-13",
        "idempotency_key": str(uuid4()),
    }
    path = f"/api/v1/admin/billing/invoices/{invoice.id}/payments"
    first = await client.post(path, json=body, headers=auth(token))
    retry = await client.post(path, json=body, headers=auth(token))
    assert first.status_code == 201
    assert retry.status_code == 200
    assert first.json()["id"] == retry.json()["id"]
