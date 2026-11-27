"""Single-use cross-app handoff integration tests (requires TEST_MONGODB_URI)."""

import base64
import hashlib
from datetime import UTC, datetime, timedelta

from app.core.security import hash_token
from app.core.deps import Principal
from app.core.totp_guard import require_totp_session
from app.main import app as fastapi_app
from app.modules.auth.models import AppHandoff, User
from app.modules.nurses.models import NurseProfile
from tests.conftest import auth, make_token


def _challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


async def _dual_user() -> User:
    user = User(
        name="Cross App User",
        email=f"handoff-{datetime.now(UTC).timestamp()}@example.test",
        password_hash="not-a-real-password-hash",
        scopes=["field:use", "content:read", "sos:send"],
        kind="staff",
    )
    await user.insert()
    return user


async def _issue(client, user: User, *, challenge: str | None = None) -> str:
    response = await client.post(
        "/api/v1/auth/handoff",
        headers=auth(make_token(user.scopes, user_id=str(user.id))),
        json={"source_app": "admin", "target_app": "nurse", "challenge": challenge},
    )
    assert response.status_code == 200, response.text
    return response.json()["code"]


async def test_handoff_code_is_hashed_single_use_and_creates_independent_nurse_session(mongo, client):
    user = await _dual_user()
    code = await _issue(client, user)

    stored = await AppHandoff.find_one(AppHandoff.code_hash == hash_token(code))
    assert stored is not None
    assert stored.used_at is None
    assert stored.target_app == "nurse"
    assert stored.code_hash != code

    redeemed = await client.post(
        "/api/v1/auth/handoff/redeem",
        headers={"X-Client": "native"},
        json={"code": code, "app": "nurse"},
    )
    assert redeemed.status_code == 200, redeemed.text
    body = redeemed.json()
    assert body["refresh_token"]
    assert body["user"]["id"] == str(user.id)
    assert await NurseProfile.find_one(NurseProfile.user_id == str(user.id)) is not None

    replay = await client.post(
        "/api/v1/auth/handoff/redeem",
        headers={"X-Client": "native"},
        json={"code": code, "app": "nurse"},
    )
    assert replay.status_code == 401


def test_pkce_challenge_matches_verifier():
    assert _challenge("A" * 43) == _challenge("A" * 43)
    assert _challenge("A" * 43) != _challenge("B" * 43)


async def test_handoff_pkce_mismatch_burns_the_code(mongo, client):
    user = await _dual_user()
    verifier = "A" * 43
    code = await _issue(client, user, challenge=_challenge(verifier))
    denied = await client.post(
        "/api/v1/auth/handoff/redeem",
        json={"code": code, "app": "nurse", "verifier": "B" * 43},
    )
    assert denied.status_code == 401
    stored = await AppHandoff.find_one(AppHandoff.code_hash == hash_token(code))
    assert stored is not None and stored.used_at is not None


async def test_handoff_rechecks_target_scope_at_redemption(mongo, client):
    user = await _dual_user()
    code = await _issue(client, user)
    user.scopes = ["content:read"]
    await user.save()
    denied = await client.post(
        "/api/v1/auth/handoff/redeem", json={"code": code, "app": "nurse"}
    )
    assert denied.status_code == 401
    assert await NurseProfile.find_one(NurseProfile.user_id == str(user.id)) is None


async def test_handoff_expiry_is_enforced(mongo, client):
    user = await _dual_user()
    code = await _issue(client, user)
    stored = await AppHandoff.find_one(AppHandoff.code_hash == hash_token(code))
    assert stored is not None
    stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await stored.save()
    denied = await client.post(
        "/api/v1/auth/handoff/redeem", json={"code": code, "app": "nurse"}
    )
    assert denied.status_code == 401


async def test_app_access_uses_stored_scopes_and_reports_lazy_provisioning(mongo, client):
    user = await _dual_user()
    response = await client.get(
        "/api/v1/auth/app-access",
        headers=auth(make_token(user.scopes, user_id=str(user.id))),
    )
    assert response.status_code == 200, response.text
    access = response.json()
    assert access["admin"]["allowed"] is True
    assert access["nurse"]["allowed"] is True
    assert access["nurse"]["reason"] == "will_create_profile"
    assert isinstance(access["handoff_enabled"], bool)


async def test_handoff_check_reports_account_ownership_without_consuming_code(mongo, client):
    user = await _dual_user()
    other = User(
        name="Other Nurse", email=f"other-{datetime.now(UTC).timestamp()}@example.test",
        password_hash="not-a-real-password-hash", scopes=["field:use"], kind="nurse",
    )
    await other.insert()
    code = await _issue(client, user)
    checked = await client.post("/api/v1/auth/handoff/check",
        headers=auth(make_token(["field:use"], user_id=str(other.id))),
        json={"code": code, "app": "nurse"})
    assert checked.status_code == 200 and checked.json() == {"same_user": False}
    stored = await AppHandoff.find_one(AppHandoff.code_hash == hash_token(code))
    assert stored is not None and stored.used_at is None
    checked_same = await client.post("/api/v1/auth/handoff/check",
        headers=auth(make_token(user.scopes, user_id=str(user.id))),
        json={"code": code, "app": "nurse"})
    assert checked_same.status_code == 200 and checked_same.json() == {"same_user": True}


async def test_automatic_handoff_requires_master_and_user_opt_in_and_is_rechecked_on_redeem(mongo, client):
    from app.modules.auth.auto_sso import set_master_auto_sso_enabled
    user = await _dual_user()
    headers = auth(make_token(user.scopes, user_id=str(user.id)))
    denied = await client.post("/api/v1/auth/handoff", headers=headers,
        json={"source_app": "admin", "target_app": "nurse", "mode": "automatic"})
    assert denied.status_code == 403
    user.auto_sso_enabled = True
    await user.save()
    # A profile opt-in alone is insufficient without Superadmin's per-user permission.
    await set_master_auto_sso_enabled(True)
    denied_permission = await client.post("/api/v1/auth/handoff", headers=headers,
        json={"source_app": "admin", "target_app": "nurse", "mode": "automatic"})
    assert denied_permission.status_code == 403
    user.auto_sso_allowed = True
    await user.save()
    issued = await client.post("/api/v1/auth/handoff", headers=headers,
        json={"source_app": "admin", "target_app": "nurse", "mode": "automatic"})
    assert issued.status_code == 200, issued.text
    user.auto_sso_allowed = False
    await user.save()
    redeemed = await client.post("/api/v1/auth/handoff/redeem",
        json={"code": issued.json()["code"], "app": "nurse"})
    assert redeemed.status_code == 401
    await set_master_auto_sso_enabled(False)


async def test_profile_auto_sso_preference_is_off_by_default_and_can_be_saved(mongo, client):
    user = await _dual_user()
    headers = auth(make_token(user.scopes, user_id=str(user.id)))
    initial = await client.get("/api/v1/auth/auto-sso", headers=headers)
    assert initial.status_code == 200
    assert initial.json() == {"master_enabled": False, "user_enabled": False, "admin_allowed": False, "effective_enabled": False}
    changed = await client.patch("/api/v1/auth/auto-sso", headers=headers, json={"enabled": True})
    assert changed.status_code == 200
    assert changed.json() == {"master_enabled": False, "user_enabled": True, "admin_allowed": False, "effective_enabled": False}
    stored = await User.get(user.id)
    assert stored is not None and stored.auto_sso_enabled is True


async def test_superadmin_auto_sso_master_and_user_controls_are_audited(mongo, client):
    from app.modules.audit.models import AuditLog
    admin = User(
        name="Security Admin", email=f"security-admin-{datetime.now(UTC).timestamp()}@example.test",
        password_hash="not-a-real-password-hash", scopes=["system:manage"], is_superadmin=True,
    )
    target = await _dual_user()
    await admin.insert()
    principal = Principal(user_id=str(admin.id), scopes=frozenset({"system:manage"}), is_superadmin=True)
    fastapi_app.dependency_overrides[require_totp_session] = lambda: principal
    try:
        initial = await client.get("/api/v1/admin/security/auto-sso")
        assert initial.status_code == 200, initial.text
        assert initial.json()["master_enabled"] is False
        changed_user = await client.patch(f"/api/v1/admin/security/auto-sso/users/{target.id}", json={"enabled": True})
        assert changed_user.status_code == 200, changed_user.text
        assert changed_user.json()["admin_allowed"] is True
        assert changed_user.json()["user_enabled"] is False
        # Superadmin permission is separate: the user has not opted in yet.
        enabled = await client.patch("/api/v1/admin/security/auto-sso/master", json={"enabled": True})
        assert enabled.status_code == 200 and enabled.json()["master_enabled"] is True
        listing = await client.get("/api/v1/admin/security/auto-sso", params={"q": target.email})
        assert listing.status_code == 200
        assert listing.json()["items"][0]["effective_enabled"] is False
        target.auto_sso_enabled = True
        await target.save()
        listing = await client.get("/api/v1/admin/security/auto-sso", params={"q": target.email})
        assert listing.json()["items"][0]["effective_enabled"] is True
        assert await AuditLog.find(AuditLog.action == "auth.auto_sso.user_permission.update").count() == 1
        assert await AuditLog.find(AuditLog.action == "auth.auto_sso.master.update").count() == 1
    finally:
        fastapi_app.dependency_overrides.pop(require_totp_session, None)
        from app.modules.auth.auto_sso import set_master_auto_sso_enabled
        target.auto_sso_allowed = False
        await target.save()
        await set_master_auto_sso_enabled(False)
