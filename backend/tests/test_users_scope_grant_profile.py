"""Granting and revoking field:use maintains the corresponding NurseProfile."""

from datetime import UTC, datetime

from app.core.deps import Principal
from app.modules.auth.models import User
from app.modules.nurses.models import Device, NurseProfile
from app.modules.users import service as users_service
from app.modules.users.schemas import UserInvite, UserUpdate


def _actor() -> Principal:
    return Principal(user_id="superadmin-00000001", scopes=frozenset(), is_superadmin=True)


async def test_invite_with_nurse_preset_creates_profile(mongo, monkeypatch):
    async def fake_deliver(*_args, **_kwargs):
        return None, {"temp_password": "shown"}

    monkeypatch.setattr(users_service, "_deliver", fake_deliver)
    body = UserInvite(
        name="Nurse Invite",
        email=f"nurse-invite-{datetime.now(UTC).timestamp()}@example.test",
        preset="nurse",
        kind="staff",
        delivery=["temp_password"],
    )
    result = await users_service.invite(_actor(), body, None)
    user = await User.get(result.id)
    assert user is not None
    profile = await NurseProfile.find_one(NurseProfile.user_id == str(user.id))
    assert profile is not None and profile.active


async def test_scope_add_reactivates_and_scope_removal_revokes_nurse_devices(mongo):
    user = User(
        name="Scope Change",
        email=f"scope-change-{datetime.now(UTC).timestamp()}@example.test",
        password_hash="not-a-real-password-hash",
        scopes=["content:read"],
        kind="staff",
    )
    await user.insert()
    actor = _actor()
    await users_service.update(actor, str(user.id), UserUpdate(scopes=["content:read", "field:use"]), None)
    profile = await NurseProfile.find_one(NurseProfile.user_id == str(user.id))
    assert profile is not None and profile.active

    await Device(
        device_id="scope-device-0001", user_id=str(user.id), platform="android", app="nurse", push_token="test-token"
    ).insert()
    await users_service.update(actor, str(user.id), UserUpdate(scopes=["content:read"]), None)
    profile = await NurseProfile.find_one(NurseProfile.user_id == str(user.id))
    device = await Device.find_one(Device.device_id == "scope-device-0001")
    assert profile is not None and profile.active is False
    assert device is not None and device.revoked_at is not None and device.push_token is None
    refreshed_user = await User.get(user.id)
    assert refreshed_user is not None and refreshed_user.is_active is True

    await users_service.update(actor, str(user.id), UserUpdate(scopes=["content:read", "field:use"]), None)
    profile = await NurseProfile.find_one(NurseProfile.user_id == str(user.id))
    assert profile is not None and profile.active is True
