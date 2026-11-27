from datetime import UTC, datetime

import pytest

from app.core.deps import Principal
from app.core.errors import AppError
from app.modules.auth.models import User
from app.modules.nurses.deps import get_active_nurse_profile
from app.modules.nurses.models import NurseProfile
from app.modules.nurses.service import ensure_nurse_profile


def _user(**overrides):
    values = {
        "name": "Cross-app Test User",
        "email": f"cross-app-{datetime.now(UTC).timestamp()}@example.test",
        "password_hash": "not-a-real-password-hash",
        "scopes": ["field:use", "sos:send", "mail:use"],
        "kind": "staff",
        "phone_e164": "+256700000001",
    }
    values.update(overrides)
    return User(**values)


async def test_ensure_profile_is_idempotent_and_uses_the_existing_user_identity(mongo):
    user = _user()
    await user.insert()
    original_scopes = list(user.scopes)

    profile, created = await ensure_nurse_profile(user, source="repair")
    again, created_again = await ensure_nurse_profile(user, source="lazy")

    assert created is True
    assert created_again is False
    assert again.id == profile.id
    assert profile.user_id == str(user.id)
    assert profile.phone_e164 == user.phone_e164
    assert profile.staff_number.startswith("STF-")
    assert profile.staff_number_provisional is True
    assert profile.provisioned_source == "repair"
    assert profile.provisioned_at is not None
    assert user.scopes == original_scopes


@pytest.mark.parametrize(
    "overrides",
    [
        {"is_test": True},
        {"is_active": False},
        {"scopes": ["mail:use"]},
    ],
)
async def test_ensure_profile_skips_sandbox_inactive_and_unscoped_users(mongo, overrides):
    user = _user(**overrides)
    await user.insert()
    profile, created = await ensure_nurse_profile(user, source="repair")
    assert profile is None
    assert created is False
    assert await NurseProfile.find_one(NurseProfile.user_id == str(user.id)) is None


async def test_lazy_self_heal_requires_stored_field_scope_and_preserves_inactive_profile(mongo):
    user = _user()
    await user.insert()
    principal = Principal(user_id=str(user.id), scopes=frozenset(), is_superadmin=True)

    # The superadmin shortcut on Principal.has() cannot create a nurse profile by itself.
    no_scope_user = _user(scopes=["mail:use"])
    await no_scope_user.insert()
    no_scope_principal = Principal(user_id=str(no_scope_user.id), scopes=frozenset(), is_superadmin=True)
    with pytest.raises(AppError) as no_scope_error:
        await get_active_nurse_profile(no_scope_principal)
    assert no_scope_error.value.status_code == 403
    assert no_scope_error.value.code == "nurse_scope_missing"

    profile, _ = await ensure_nurse_profile(user, source="repair")
    assert profile is not None
    profile.active = False
    await profile.save()

    with pytest.raises(AppError) as inactive_error:
        await get_active_nurse_profile(principal)
    assert inactive_error.value.code == "nurse_profile_inactive"
    still_inactive, created = await ensure_nurse_profile(user, source="lazy")
    assert created is False
    assert still_inactive is not None and still_inactive.active is False

    reactivated, created = await ensure_nurse_profile(user, source="scope_grant", reactivate=True)
    assert created is False
    assert reactivated is not None and reactivated.active is True
