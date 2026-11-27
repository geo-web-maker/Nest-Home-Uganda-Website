"""The first nurse profile request repairs eligible legacy accounts."""

from datetime import UTC, datetime

from app.modules.auth.models import User
from app.modules.nurses.models import NurseProfile
from tests.conftest import auth, make_token


async def _user(**overrides) -> User:
    values = {
        "name": "Legacy Nurse",
        "email": f"legacy-nurse-{datetime.now(UTC).timestamp()}@example.test",
        "password_hash": "not-a-real-password-hash",
        "scopes": ["field:use"],
        "kind": "staff",
    }
    values.update(overrides)
    user = User(**values)
    await user.insert()
    return user


async def test_field_me_self_heals_stored_field_scope_user(mongo, client):
    user = await _user()
    response = await client.get(
        "/api/v1/field/me",
        headers=auth(make_token(["field:use"], user_id=str(user.id))),
    )
    assert response.status_code == 200, response.text
    profile = await NurseProfile.find_one(NurseProfile.user_id == str(user.id))
    assert profile is not None and profile.active
    assert profile.staff_number.startswith("STF-")


async def test_superadmin_bypass_does_not_provision_without_stored_field_scope(mongo, client):
    user = await _user(scopes=["content:read"], is_superadmin=True)
    response = await client.get(
        "/api/v1/field/me",
        headers=auth(make_token(["content:read"], superadmin=True, user_id=str(user.id))),
    )
    assert response.status_code == 403
    assert await NurseProfile.find_one(NurseProfile.user_id == str(user.id)) is None


async def test_existing_inactive_profile_is_not_reactivated_by_lazy_load(mongo, client):
    user = await _user()
    profile = NurseProfile(user_id=str(user.id), staff_number="STF-LEGACY", active=False)
    await profile.insert()
    response = await client.get(
        "/api/v1/field/me",
        headers=auth(make_token(["field:use"], user_id=str(user.id))),
    )
    assert response.status_code == 404
    refreshed = await NurseProfile.find_one(NurseProfile.user_id == str(user.id))
    assert refreshed is not None and refreshed.active is False
