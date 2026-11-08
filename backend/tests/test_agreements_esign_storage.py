import asyncio

import pytest

from app.core.storage import Bucket, MemoryStorage
from app.modules.agreements import service
from app.modules.agreements.models import AgreementSignature


def test_locked_object_cannot_be_deleted_or_overwritten() -> None:
    async def run() -> None:
        store = MemoryStorage()
        await store.put_locked(Bucket.SIGNED, "a.pdf", b"x", "application/pdf", 30)
        with pytest.raises(PermissionError):
            await store.delete(Bucket.SIGNED, "a.pdf")
        with pytest.raises(PermissionError):
            await store.put_locked(Bucket.SIGNED, "a.pdf", b"y", "application/pdf", 30)
        assert await store.get(Bucket.SIGNED, "a.pdf") == b"x"

    asyncio.run(run())


def test_consent_text_is_fixed_on_the_server() -> None:
    assert "electronically" in service.ESIGN_CONSENT_TEXT
    assert service.ESIGN_CONSENT_VERSION


def test_signature_record_keeps_plain_evidence() -> None:
    sig = AgreementSignature(role="client", name="Jane", method="drawn", content_hash="0" * 64,
                             ip_address="203.0.113.9", signer_email="a@b.co", signer_phone="+256700000111")
    assert sig.ip_address == "203.0.113.9" and sig.signer_email == "a@b.co"
