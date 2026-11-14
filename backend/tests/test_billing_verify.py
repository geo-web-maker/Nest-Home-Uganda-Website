import hashlib
from datetime import date

import pytest
from beanie import PydanticObjectId

from app.core.errors import NotFound
from app.modules.billing import rules, service
from app.modules.billing.models import BillTo, Invoice


@pytest.mark.asyncio
async def test_public_verify_has_exact_minimal_key_set_and_masks_client(mongo):
    snapshot = {
        "schema_version": 1,
        "doc_type": "invoice",
        "reference": "BHC-INV-2026-0042",
        "currency": "UGX",
        "is_test": False,
        "bill_to": {"name": "Mrs A Nakato"},
        "care_recipient": {"name": "", "program": ""},
        "items": [],
        "total_ugx": 410000,
        "paid_ugx": 0,
        "balance_ugx": 410000,
        "document_date": "2026-11-13",
        "due_date": "2026-11-20",
        "payment_instructions": "Client to supply",
        "notes": "",
    }
    canonical = rules.canonical_snapshot(snapshot)
    digest = hashlib.sha256(canonical.encode()).hexdigest()
    doc = Invoice(
        reference=snapshot["reference"],
        status="issued",
        bill_to=BillTo(name="Mrs A Nakato"),
        issue_date=date(2026, 11, 13),
        due_date=date(2026, 11, 20),
        total_ugx=410000,
        balance_ugx=410000,
        created_by=PydanticObjectId(),
        sealed={
            "content_hash": digest,
            "snapshot_json": canonical,
            "renditions": {"ledger": {"pdf_sha256": "a" * 64}, "slip": {"pdf_sha256": "b" * 64}},
        },
    )
    await doc.insert()
    result = await service.verify_public(doc.reference, digest[:16])
    assert set(result) == {
        "valid",
        "status",
        "superseded",
        "doc_type",
        "reference",
        "practice",
        "issued_on",
        "amount_ugx",
        "client_name",
        "voided_at",
        "content_hash",
        "pdf_sha256",
    }
    assert result["client_name"] == "M** A** N*****"
    assert result["valid"] is True


@pytest.mark.asyncio
async def test_wrong_reference_and_wrong_code_are_identical_not_found(mongo):
    with pytest.raises(NotFound) as wrong_ref:
        await service.verify_public("BHC-INV-2026-9999", "a" * 16)
    snapshot = {
        "schema_version": 1,
        "doc_type": "invoice",
        "reference": "BHC-INV-2026-0001",
        "currency": "UGX",
        "is_test": False,
        "bill_to": {"name": "Test"},
        "care_recipient": {},
        "items": [],
        "total_ugx": 1,
        "paid_ugx": 0,
        "balance_ugx": 1,
        "document_date": "2026-11-13",
        "due_date": "2026-11-13",
        "payment_instructions": "",
        "notes": "",
    }
    canonical = rules.canonical_snapshot(snapshot)
    digest = hashlib.sha256(canonical.encode()).hexdigest()
    doc = Invoice(
        reference=snapshot["reference"],
        status="issued",
        bill_to=BillTo(name="Test"),
        issue_date=date(2026, 11, 13),
        due_date=date(2026, 11, 13),
        total_ugx=1,
        balance_ugx=1,
        created_by=PydanticObjectId(),
        sealed={
            "content_hash": digest,
            "snapshot_json": canonical,
            "renditions": {"ledger": {"pdf_sha256": "a"}, "slip": {"pdf_sha256": "b"}},
        },
    )
    await doc.insert()
    with pytest.raises(NotFound) as wrong_code:
        await service.verify_public(doc.reference, "0" * 16)
    assert str(wrong_ref.value) == str(wrong_code.value)


@pytest.mark.asyncio
async def test_verify_route_404_responses_match_and_headers_are_private(client, mongo):
    snapshot = {
        "schema_version": 1,
        "doc_type": "invoice",
        "reference": "BHC-INV-2026-0060",
        "currency": "UGX",
        "is_test": False,
        "bill_to": {"name": "Mrs A Nakato"},
        "care_recipient": {"name": "", "program": ""},
        "items": [],
        "total_ugx": 410000,
        "paid_ugx": 0,
        "balance_ugx": 410000,
        "document_date": "2026-11-13",
        "due_date": "2026-11-20",
        "payment_instructions": "Client to supply",
        "notes": "",
    }
    canonical = rules.canonical_snapshot(snapshot)
    digest = hashlib.sha256(canonical.encode()).hexdigest()
    doc = Invoice(
        reference=snapshot["reference"],
        status="issued",
        bill_to=BillTo(name="Mrs A Nakato"),
        issue_date=date(2026, 11, 13),
        due_date=date(2026, 11, 20),
        total_ugx=410000,
        balance_ugx=410000,
        created_by=PydanticObjectId(),
        sealed={
            "content_hash": digest,
            "snapshot_json": canonical,
            "renditions": {"ledger": {"pdf_sha256": "a" * 64}, "slip": {"pdf_sha256": "b" * 64}},
        },
    )
    await doc.insert()
    wrong_ref = await client.get(f"/api/v1/public/billing/verify/BHC-INV-2026-9999/{digest[:16]}")
    wrong_code = await client.get(f"/api/v1/public/billing/verify/{doc.reference}/0000000000000000")
    assert wrong_ref.status_code == wrong_code.status_code == 404
    assert wrong_ref.content == wrong_code.content
    assert wrong_ref.headers["Cache-Control"] == "no-store"
    assert wrong_ref.headers["X-Robots-Tag"] == "noindex"


@pytest.mark.asyncio
async def test_verify_route_rate_limits_after_twenty_checks(client, mongo):
    snapshot = {
        "schema_version": 1,
        "doc_type": "invoice",
        "reference": "BHC-INV-2026-0061",
        "currency": "UGX",
        "is_test": False,
        "bill_to": {"name": "Test Client"},
        "care_recipient": {"name": "", "program": ""},
        "items": [],
        "total_ugx": 1000,
        "paid_ugx": 0,
        "balance_ugx": 1000,
        "document_date": "2026-11-13",
        "due_date": "2026-11-20",
        "payment_instructions": "Client to supply",
        "notes": "",
    }
    canonical = rules.canonical_snapshot(snapshot)
    digest = hashlib.sha256(canonical.encode()).hexdigest()
    doc = Invoice(
        reference=snapshot["reference"],
        status="issued",
        bill_to=BillTo(name="Test Client"),
        issue_date=date(2026, 11, 13),
        due_date=date(2026, 11, 20),
        total_ugx=1000,
        balance_ugx=1000,
        created_by=PydanticObjectId(),
        sealed={
            "content_hash": digest,
            "snapshot_json": canonical,
            "renditions": {"ledger": {"pdf_sha256": "a" * 64}, "slip": {"pdf_sha256": "b" * 64}},
        },
    )
    await doc.insert()
    path = f"/api/v1/public/billing/verify/{doc.reference}/{digest[:16]}"
    responses = [await client.get(path) for _ in range(20)]
    assert all(response.status_code == 200 for response in responses)
    limited = await client.get(path)
    assert limited.status_code == 429
    assert limited.headers["Cache-Control"] == "no-store"
    assert limited.headers["X-Robots-Tag"] == "noindex"


@pytest.mark.asyncio
async def test_public_verify_rejects_a_snapshot_modified_after_sealing(mongo):
    snapshot = {
        "schema_version": 1,
        "doc_type": "invoice",
        "reference": "BHC-INV-2026-0099",
        "currency": "UGX",
        "is_test": False,
        "bill_to": {"name": "Test Client"},
        "care_recipient": {"name": "", "program": ""},
        "items": [],
        "total_ugx": 1000,
        "paid_ugx": 0,
        "balance_ugx": 1000,
        "document_date": "2026-11-13",
        "due_date": "2026-11-20",
        "payment_instructions": "Client to supply",
        "notes": "",
    }
    canonical = rules.canonical_snapshot(snapshot)
    digest = hashlib.sha256(canonical.encode()).hexdigest()
    tampered = canonical.replace("Test Client", "Other Client")
    doc = Invoice(
        reference=snapshot["reference"],
        status="issued",
        bill_to=BillTo(name="Test Client"),
        issue_date=date(2026, 11, 13),
        due_date=date(2026, 11, 20),
        total_ugx=1000,
        balance_ugx=1000,
        created_by=PydanticObjectId(),
        sealed={
            "content_hash": digest,
            "snapshot_json": tampered,
            "renditions": {"ledger": {"pdf_sha256": "a" * 64}, "slip": {"pdf_sha256": "b" * 64}},
        },
    )
    await doc.insert()
    with pytest.raises(NotFound):
        await service.verify_public(doc.reference, digest[:16])
