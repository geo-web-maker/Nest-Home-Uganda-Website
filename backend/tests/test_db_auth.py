"""Auth against a real MongoDB (needs TEST_MONGODB_URI). NOT RUN where there is no database."""

from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.core.security import decode_access_token, hash_password, hash_token
from app.modules.audit.models import AuditLog
from app.modules.auth import service
from app.modules.auth.models import RefreshToken, User
from app.modules.auth.scopes import ALL_SCOPE_IDS
from tests.conftest import auth, make_token

PASSWORD = "correct horse battery staple"


async def make_user(**kw) -> User:
    data = {
        "name": "Test User",
        "email": "user@example.com",
        "password_hash": hash_password(PASSWORD),
        "scopes": ["content:read"],
    }
    user = User(**{**data, **kw})
    await user.insert()
    return user


async def login(client: httpx.AsyncClient, password: str = PASSWORD, email="user@example.com"):
    return await client.post("/api/v1/auth/login", json={"email": email, "password": password})


async def test_login_success_sets_cookies_and_returns_scopes(
    mongo: object, client: httpx.AsyncClient
) -> None:
    user = await make_user(scopes=["content:read", "jobs:read"])
    r = await login(client)
    assert r.status_code == 200
    body = r.json()
    claims = decode_access_token(body["access_token"])
    assert claims.user_id == str(user.id)
    assert claims.scopes == {"content:read", "jobs:read"}
    assert body["user"]["email"] == "user@example.com"
    assert "password_hash" not in str(body)
    assert client.cookies.get("nhc_refresh") and client.cookies.get("nhc_csrf")
    me = await client.get("/api/v1/auth/me", headers=auth(body["access_token"]))
    assert me.status_code == 200 and me.json()["id"] == str(user.id)
    assert await AuditLog.find(AuditLog.action == "auth.login").count() == 1


async def test_email_is_case_insensitive(mongo: object, client: httpx.AsyncClient) -> None:
    await make_user()
    assert (await login(client, email="USER@Example.com")).status_code == 200


async def test_wrong_password_and_unknown_email_look_the_same(
    mongo: object, client: httpx.AsyncClient
) -> None:
    await make_user()
    wrong = await login(client, "nope")
    unknown = await login(client, PASSWORD, email="ghost@example.com")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


async def test_five_failures_lock_the_account(mongo: object, client: httpx.AsyncClient) -> None:
    await make_user()
    for _ in range(5):
        assert (await login(client, "nope")).status_code == 401
    locked = await login(client)  # correct password, still refused
    assert locked.status_code == 429
    user = await User.find_one(User.email == "user@example.com")
    assert user is not None and user.locked_until is not None


async def test_lock_ends_and_old_failures_expire(mongo: object) -> None:
    await make_user()
    now = datetime.now(UTC)
    for _ in range(5):
        with pytest.raises(Exception):  # noqa: B017, PT011
            await service.login("user@example.com", "nope", "h", None, now=now)
    later = now + timedelta(minutes=16)
    session = await service.login("user@example.com", PASSWORD, "h", None, now=later)
    assert session.access_token


async def test_inactive_user_and_unfinished_totp_cannot_sign_in(
    mongo: object, client: httpx.AsyncClient
) -> None:
    await make_user(is_active=False)
    assert (await login(client)).status_code == 401
    await User.find_all().delete()
    await make_user(totp_secret="encrypted-secret")
    assert (await login(client)).status_code == 403  # fails closed until TOTP is built


async def test_refresh_rotates_and_reuse_ends_all_sessions(
    mongo: object, client: httpx.AsyncClient
) -> None:
    await make_user()
    first = (await login(client)).json()
    old_refresh = client.cookies.get("nhc_refresh")
    r = await client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": first["csrf_token"]})
    assert r.status_code == 200
    second = r.json()
    assert client.cookies.get("nhc_refresh") != old_refresh
    # Replaying the first token is treated as theft: everything is revoked.
    client.cookies.set("nhc_refresh", old_refresh, path="/api/v1/auth")
    client.cookies.set("nhc_csrf", second["csrf_token"], path="/api/v1/auth")
    replay = await client.post(
        "/api/v1/auth/refresh", headers={"X-CSRF-Token": second["csrf_token"]}
    )
    assert replay.status_code == 401
    assert await RefreshToken.find(RefreshToken.revoked_at == None).count() == 0  # noqa: E711


async def test_refresh_rereads_scopes_from_the_database(
    mongo: object, client: httpx.AsyncClient
) -> None:
    user = await make_user(scopes=["content:read"])
    first = (await login(client)).json()
    user.scopes = ["content:read", "content:write"]
    await user.save()
    r = await client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": first["csrf_token"]})
    assert decode_access_token(r.json()["access_token"]).scopes == {"content:read", "content:write"}


async def test_logout_revokes_the_refresh_token(mongo: object, client: httpx.AsyncClient) -> None:
    await make_user()
    body = (await login(client)).json()
    raw = client.cookies.get("nhc_refresh")
    out = await client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": body["csrf_token"]})
    assert out.status_code == 204
    stored = await RefreshToken.find_one(RefreshToken.token_hash == hash_token(raw))
    assert stored is not None and stored.revoked_at is not None


async def test_changing_scopes_signs_the_user_out(mongo: object, client: httpx.AsyncClient) -> None:
    """12.6 test 5: sign_out_user invalidates the user's refresh tokens."""
    user = await make_user()
    body = (await login(client)).json()
    await service.sign_out_user(user)
    r = await client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": body["csrf_token"]})
    assert r.status_code == 401


async def test_expired_refresh_token_is_rejected(mongo: object) -> None:
    await make_user()
    session = await service.login("user@example.com", PASSWORD, "h", None)
    later = datetime.now(UTC) + timedelta(days=8)
    with pytest.raises(Exception):  # noqa: B017, PT011
        await service.refresh(session.refresh_token, None, now=later)


async def test_scopes_endpoint_lists_the_registry(mongo: object, client: httpx.AsyncClient) -> None:
    r = await client.get("/api/v1/admin/scopes", headers=auth(make_token(["users:read"])))
    assert r.status_code == 200
    assert {s["id"] for s in r.json()} == ALL_SCOPE_IDS
