"""Dual nurse/admin accounts retain their staff identity when nurse access changes."""

from datetime import UTC, datetime

import pytest

from app.core.deps import Principal
from app.core.errors import Conflict
from app.modules.auth.models import User
from app.modules.nurses.models import Device, NurseProfile
from app.modules.nurses.schemas import NursePatch
from app.modules.nurses.service import delete_nurse, patch_nurse, set_nurse_password
from app.modules.nurses.schemas import NursePasswordSet


def _actor() -> Principal:
    return Principal(user_id="actor-00000001", scopes=frozenset(), is_superadmin=True)


async def _dual() -> tuple[User, NurseProfile]:
    user = User(
        name="Dual Account",
        email=f"dual-{datetime.now(UTC).timestamp()}@example.test",
        password_hash="not-a-real-password-hash",
        scopes=["content:read", "field:use", "sos:send"],
        kind="staff",
        is_active=True,
    )
    await user.insert()
    profile = NurseProfile(user_id=str(user.id), staff_number="STF-DUAL01", active=True)
    await profile.insert()
    return user, profile


async def test_dual_account_deactivation_only_changes_nurse_profile(mongo):
    user, profile = await _dual()
    updated = await patch_nurse(_actor(), str(user.id), NursePatch(active=False))
    refreshed_user = await User.get(user.id)
    assert updated.active is False
    assert refreshed_user is not None and refreshed_user.is_active is True


async def test_dual_account_delete_removes_nurse_access_but_keeps_user(mongo):
    user, profile = await _dual()
    await Device(device_id="dual-device-0001", user_id=str(user.id), platform="android", app="nurse").insert()
    await delete_nurse(_actor(), str(user.id))
    refreshed_user = await User.get(user.id)
    assert refreshed_user is not None
    assert "field:use" not in refreshed_user.scopes
    assert "sos:send" not in refreshed_user.scopes
    assert await NurseProfile.find_one(NurseProfile.user_id == str(user.id)) is None
    assert await Device.find_one(Device.user_id == str(user.id)) is None


async def test_dual_account_password_cannot_be_changed_from_nurse_roster(mongo):
    user, _profile = await _dual()
    with pytest.raises(Conflict, match="Users > Reset password"):
        await set_nurse_password(_actor(), str(user.id), NursePasswordSet(password="A sufficiently strong password 2026!"))
    refreshed_user = await User.get(user.id)
    assert refreshed_user is not None and refreshed_user.password_hash == user.password_hash
