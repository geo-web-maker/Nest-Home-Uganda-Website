"""One refused value must not stop the other fields from saving (no database)."""
import pytest
from fastapi import Response

from app.core.errors import ValidationFailed
from app.modules.agreements import router, service
from app.modules.agreements.schemas import AgreementPatch, FieldPatch


def patch(*paths):
    return AgreementPatch(changes=[FieldPatch(path=p, value="x", expected_revision=0) for p in paths])


@pytest.fixture
def stub(monkeypatch):
    applied: list[str] = []

    async def session(_cookie, _purpose):
        return object(), None

    async def patch_fields(doc, changes, **_kw):
        if any(c.path.startswith("client.phone") for c in changes):
            raise ValidationFailed("Enter a valid phone number", {"client.phone": "invalid_phone"})
        applied.extend(c.path for c in changes)
        return doc

    async def view(_doc, **_kw):
        return {"saved": list(applied)}

    monkeypatch.setattr(service, "session_agreement", session)
    monkeypatch.setattr(service, "patch_fields", patch_fields)
    monkeypatch.setattr(service, "public_view", view)
    monkeypatch.setattr(router, "client_ip", lambda _r: "1.2.3.4")
    monkeypatch.setattr(router, "hash_ip", lambda ip: ip)
    request = type("R", (), {"headers": {}})()
    return request


@pytest.mark.asyncio
async def test_good_fields_save_and_bad_one_is_reported(stub):
    result = await router.public_patch(patch("client.name", "client.phone", "client.email"), stub, Response(), None)
    assert result["saved"] == ["client.name", "client.email"]
    assert result["rejected"] == {"client.phone": "Enter a valid phone number"}


@pytest.mark.asyncio
async def test_all_good_has_no_rejected_key(stub):
    result = await router.public_patch(patch("client.name", "client.email"), stub, Response(), None)
    assert "rejected" not in result


@pytest.mark.asyncio
async def test_single_bad_field_still_errors(stub):
    with pytest.raises(ValidationFailed):
        await router.public_patch(patch("client.phone"), stub, Response(), None)


@pytest.mark.asyncio
async def test_every_field_bad_still_errors(stub):
    with pytest.raises(ValidationFailed):
        await router.public_patch(patch("client.phone", "client.phone2"), stub, Response(), None)
