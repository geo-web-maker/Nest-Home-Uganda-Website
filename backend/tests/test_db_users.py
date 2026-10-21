"""Users module against a real MongoDB (needs TEST_MONGODB_URI).

Written in S5.20 and NOT RUN locally (no MongoDB in that session). CI runs them.
"""

import re
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.core.security import hash_password, hash_token
from app.modules.audit.models import AuditLog
from app.modules.auth.models import PasswordReset, RefreshToken, User
from app.modules.notifications.providers import SendResult
from app.modules.users import service
from tests.conftest import auth, make_token

ADMIN = "/api/v1/admin/users"
PASSWORD = "correct horse battery staple"
ACTOR_ID = "a" * 24
FAKE_ID = "0" * 24


class Outbox:
    name = "test"

    def __init__(self) -> None:
        self.sent: list[tuple[list[str], str, str]] = []

    async def send(self, to: list[str], subject: str, html: str, text: str) -> SendResult:
        self.sent.append((to, subject, text))
        return SendResult(ok=True)


@pytest.fixture
def outbox(monkeypatch: pytest.MonkeyPatch) -> Outbox:
    box = Outbox()
    monkeypatch.setattr(service, "get_email_provider", lambda: box)
    return box


def manager(*scopes: str) -> dict:
    """A users:write holder. The user id is not in the database, which is fine for tokens."""
    return auth(make_token(["users:read", "users:write", *scopes], user_id=ACTOR_ID))


def superadmin(user_id: str = ACTOR_ID) -> dict:
    return auth(make_token([], superadmin=True, user_id=user_id))


async def make_user(email: str = "grace@gmail.com", **kw) -> User:
    data = {
        "name": "Grace Okello",
        "email": email,
        "password_hash": hash_password(PASSWORD),
        "scopes": ["content:read"],
    }
    user = User(**{**data, **kw})
    await user.insert()
    return user


async def actions() -> list[str]:
    return [entry.action async for entry in AuditLog.find_all()]


async def test_list_shows_status_and_pages(mongo: object, client: httpx.AsyncClient) -> None:
    await make_user("a@gmail.com", name="Amy", last_login_at=datetime.now(UTC))
    await make_user("b@gmail.com", name="Ben")
    r = await client.get(ADMIN, headers=manager())
    body = r.json()
    assert body["total"] == 2 and [i["name"] for i in body["items"]] == ["Amy", "Ben"]
    assert [i["status"] for i in body["items"]] == ["active", "invited"]
    assert "password_hash" not in str(body)
    found = (await client.get(f"{ADMIN}?q=be", headers=manager())).json()
    assert [i["name"] for i in found["items"]] == ["Ben"]


async def test_invite_creates_an_unusable_account_and_emails_a_one_time_link(
    mongo: object, client: httpx.AsyncClient, outbox: Outbox
) -> None:
    r = await client.post(
        ADMIN,
        json={"name": "Grace Okello", "email": "Grace@Gmail.com", "scopes": ["content:read"]},
        headers=manager("content:read"),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == "grace@gmail.com" and body["status"] == "invited"
    assert body["is_superadmin"] is False and body["scopes"] == ["content:read"]
    user = await User.find_one({"email": "grace@gmail.com"})
    assert user is not None
    login = await client.post(
        "/api/v1/auth/login", json={"email": "grace@gmail.com", "password": PASSWORD}
    )
    assert login.status_code == 401
    link = await PasswordReset.find_one({"user_id": user.id})
    assert link is not None
    assert timedelta(days=6, hours=23) < link.expires_at - datetime.now(UTC) <= timedelta(days=7)
    assert len(outbox.sent) == 1 and outbox.sent[0][0] == ["grace@gmail.com"]
    token = re.search(r"token=(\S+)", outbox.sent[0][2])
    assert token and hash_token(token.group(1)) == link.token_hash
    assert "user.invite" in await actions()


async def test_invite_refuses_a_duplicate_email(
    mongo: object, client: httpx.AsyncClient, outbox: Outbox
) -> None:
    await make_user()
    r = await client.post(
        ADMIN,
        json={"name": "Grace Two", "email": "grace@gmail.com", "scopes": []},
        headers=manager(),
    )
    assert r.status_code == 409 and not outbox.sent


async def test_escalation_is_refused(
    mongo: object, client: httpx.AsyncClient, outbox: Outbox
) -> None:
    target = await make_user()
    # cannot grant a scope the manager does not hold
    r = await client.patch(
        f"{ADMIN}/{target.id}",
        json={"scopes": ["content:read", "settings:write"]},
        headers=manager("content:read"),
    )
    assert r.status_code == 403
    # cannot grant system:manage, even holding it
    r = await client.patch(
        f"{ADMIN}/{target.id}",
        json={"scopes": ["system:manage"]},
        headers=manager("system:manage", "content:read"),
    )
    assert r.status_code == 403
    invite = await client.post(
        ADMIN,
        json={"name": "Hugo Opio", "email": "hugo@gmail.com", "scopes": ["system:manage"]},
        headers=manager("system:manage"),
    )
    assert invite.status_code == 403 and await User.find({"email": "hugo@gmail.com"}).count() == 0
    # a superadmin can
    ok = await client.patch(
        f"{ADMIN}/{target.id}", json={"scopes": ["system:manage"]}, headers=superadmin()
    )
    assert ok.status_code == 200 and ok.json()["scopes"] == ["system:manage"]
    # unknown scopes are refused
    bad = await client.patch(
        f"{ADMIN}/{target.id}", json={"scopes": ["nope:read"]}, headers=superadmin()
    )
    assert bad.status_code == 422


async def test_nobody_edits_their_own_scopes_or_deactivates_themselves(
    mongo: object, client: httpx.AsyncClient
) -> None:
    me = await make_user(scopes=["users:read", "users:write", "content:read"])
    headers = auth(make_token(["users:read", "users:write", "content:read"], user_id=str(me.id)))
    own = await client.patch(f"{ADMIN}/{me.id}", json={"scopes": ["users:write"]}, headers=headers)
    assert own.status_code == 403
    off = await client.patch(f"{ADMIN}/{me.id}", json={"active": False}, headers=headers)
    assert off.status_code == 403


async def test_a_scope_change_signs_the_user_out_and_is_audited(
    mongo: object, client: httpx.AsyncClient
) -> None:
    target = await make_user()
    token = RefreshToken(
        user_id=target.id, token_hash="h" * 64, expires_at=datetime.now(UTC) + timedelta(days=1)
    )
    await token.insert()
    r = await client.patch(
        f"{ADMIN}/{target.id}",
        json={"scopes": ["content:read", "content:write"]},
        headers=manager("content:read", "content:write"),
    )
    assert r.status_code == 200
    stored = await RefreshToken.get(token.id)
    assert stored is not None and stored.revoked_at is not None
    entry = await AuditLog.find_one({"action": "user.update"})
    assert entry is not None and entry.before["scopes"] == ["content:read"]
    assert entry.after["scopes"] == ["content:read", "content:write"]
    # an unchanged scope list is not a change: nothing is revoked or logged again
    again = await client.patch(
        f"{ADMIN}/{target.id}",
        json={"scopes": ["content:write", "content:read"]},
        headers=manager("content:read", "content:write"),
    )
    assert again.status_code == 200 and (await actions()).count("user.update") == 1


async def test_deactivating_signs_out_and_blocks_login(
    mongo: object, client: httpx.AsyncClient
) -> None:
    target = await make_user()
    token = RefreshToken(
        user_id=target.id, token_hash="i" * 64, expires_at=datetime.now(UTC) + timedelta(days=1)
    )
    await token.insert()
    r = await client.patch(f"{ADMIN}/{target.id}", json={"active": False}, headers=manager())
    assert r.status_code == 200 and r.json()["active"] is False
    stored = await RefreshToken.get(token.id)
    assert stored is not None and stored.revoked_at is not None
    login = await client.post(
        "/api/v1/auth/login", json={"email": "grace@gmail.com", "password": PASSWORD}
    )
    assert login.status_code == 401


async def test_the_last_superadmin_cannot_be_deactivated(
    mongo: object, client: httpx.AsyncClient
) -> None:
    only = await make_user("boss@gmail.com", is_superadmin=True)
    r = await client.patch(f"{ADMIN}/{only.id}", json={"active": False}, headers=superadmin())
    assert r.status_code == 409
    refreshed = await User.get(only.id)
    assert refreshed is not None and refreshed.is_active
    second = await make_user("boss2@gmail.com", is_superadmin=True)
    ok = await client.patch(f"{ADMIN}/{second.id}", json={"active": False}, headers=superadmin())
    assert ok.status_code == 200


async def test_only_a_superadmin_can_change_a_superadmin(
    mongo: object, client: httpx.AsyncClient, outbox: Outbox
) -> None:
    boss = await make_user("boss@gmail.com", is_superadmin=True)
    for method, path, body in (
        ("PATCH", f"{ADMIN}/{boss.id}", {"active": False}),
        ("POST", f"{ADMIN}/{boss.id}/reset-password", {}),
        ("POST", f"{ADMIN}/{boss.id}/sign-out", {}),
    ):
        r = await client.request(method, path, json=body, headers=manager())
        assert r.status_code == 403, path
    assert not outbox.sent


async def test_reset_password_ends_sessions_and_sends_a_one_hour_link(
    mongo: object, client: httpx.AsyncClient, outbox: Outbox
) -> None:
    target = await make_user()
    token = RefreshToken(
        user_id=target.id, token_hash="j" * 64, expires_at=datetime.now(UTC) + timedelta(days=1)
    )
    await token.insert()
    r = await client.post(f"{ADMIN}/{target.id}/reset-password", json={}, headers=manager())
    assert r.status_code == 200 and r.json() == {"status": "sent"}
    link = await PasswordReset.find_one({"user_id": target.id})
    assert link is not None
    assert timedelta(minutes=59) < link.expires_at - datetime.now(UTC) <= timedelta(minutes=60)
    stored = await RefreshToken.get(token.id)
    assert stored is not None and stored.revoked_at is not None
    assert len(outbox.sent) == 1 and "user.reset_password" in await actions()
    target.is_active = False
    await target.save()
    off = await client.post(f"{ADMIN}/{target.id}/reset-password", json={}, headers=manager())
    assert off.status_code == 422


async def test_sign_out_revokes_every_session(mongo: object, client: httpx.AsyncClient) -> None:
    target = await make_user()
    token = RefreshToken(
        user_id=target.id, token_hash="k" * 64, expires_at=datetime.now(UTC) + timedelta(days=1)
    )
    await token.insert()
    r = await client.post(f"{ADMIN}/{target.id}/sign-out", json={}, headers=manager())
    assert r.status_code == 200
    stored = await RefreshToken.get(token.id)
    assert stored is not None and stored.revoked_at is not None
    assert "user.sign_out" in await actions()
    missing = await client.post(f"{ADMIN}/{FAKE_ID}/sign-out", json={}, headers=manager())
    assert missing.status_code == 404


async def test_the_emailed_link_sets_a_password_once(
    mongo: object, client: httpx.AsyncClient, outbox: Outbox
) -> None:
    await client.post(
        ADMIN,
        json={"name": "Grace Okello", "email": "grace@gmail.com", "scopes": []},
        headers=manager(),
    )
    match = re.search(r"token=(\S+)", outbox.sent[0][2])
    assert match
    raw = match.group(1)
    url = "/api/v1/auth/set-password"
    ok = await client.post(url, json={"token": raw, "password": "a brand new passphrase"})
    assert ok.status_code == 200 and ok.json() == {"status": "password_set"}
    new_login = {"email": "grace@gmail.com", "password": "a brand new passphrase"}
    login = await client.post("/api/v1/auth/login", json=new_login)
    assert login.status_code == 200
    again = await client.post(url, json={"token": raw, "password": "another new passphrase"})
    assert again.status_code == 422 and again.json()["error"]["fields"] == {"token": "invalid"}


async def test_expired_unknown_and_deactivated_links_are_refused(
    mongo: object, client: httpx.AsyncClient
) -> None:
    user = await make_user()
    past = PasswordReset(
        user_id=user.id,
        token_hash=hash_token("e" * 40),
        expires_at=datetime.now(UTC) - timedelta(minutes=1),
    )
    await past.insert()
    url = "/api/v1/auth/set-password"
    for token in ("e" * 40, "u" * 40):
        r = await client.post(url, json={"token": token, "password": "a brand new passphrase"})
        assert r.status_code == 422
    live = PasswordReset(
        user_id=user.id,
        token_hash=hash_token("l" * 40),
        expires_at=datetime.now(UTC) + timedelta(hours=1),
    )
    await live.insert()
    user.is_active = False
    await user.save()
    r = await client.post(url, json={"token": "l" * 40, "password": "a brand new passphrase"})
    assert r.status_code == 422
