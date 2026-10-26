"""Invite lifecycle acceptance. Written, not run; CI must execute it."""

import importlib
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.core.security import hash_password, hash_token
from app.modules.auth.models import PasswordReset, User
from app.modules.nurses.models import NurseProfile
from tests.conftest import auth, make_token


async def test_revoke_invalidates_invite_and_resend_creates_a_new_one(
    mongo: object, client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from uuid import uuid4

    nurse = User(
        name="Track C Invite Nurse",
        email=f"track-c-invite-{uuid4().hex}@example.test",
        password_hash=hash_password("test-only-long-password-123"),
        scopes=["field:use", "sos:send"],
        kind="nurse",
        reach="own",
        is_active=True,
    )
    await nurse.insert()
    await NurseProfile(user_id=str(nurse.id), staff_number="TC-INVITE-01", active=True).insert()
    raw_token = "track-c-invite-revoke-token-0001"
    old_link = PasswordReset(
        user_id=nurse.id,
        token_hash=hash_token(raw_token),
        expires_at=datetime.now(UTC) + timedelta(days=1),
        purpose="invite",
    )
    await old_link.insert()

    user_service = importlib.import_module("app.modules.users.service")

    async def no_op_send(*_args: object, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr(user_service, "_send_link", no_op_send)
    headers = auth(make_token([], superadmin=True))
    base = f"/api/v1/admin/care/nurses/{nurse.id}/invite"
    revoked = await client.delete(base, headers=headers)
    assert revoked.status_code == 200
    saved_old_link = await PasswordReset.find_one(PasswordReset.token_hash == hash_token(raw_token))
    assert saved_old_link is not None and saved_old_link.used_at is not None

    resent = await client.post(base, headers=headers)
    assert resent.status_code == 200
    assert resent.json()["status"] == "sent"
    new_link = await PasswordReset.find_one(
        PasswordReset.user_id == nurse.id,
        PasswordReset.purpose == "invite",
        PasswordReset.used_at == None,  # noqa: E711
    )  # noqa: E711
    assert new_link is not None and new_link.token_hash != hash_token(raw_token)
