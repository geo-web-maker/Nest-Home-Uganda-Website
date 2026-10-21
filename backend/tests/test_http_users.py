"""Users endpoints: checks that run before any database read."""

import httpx

from tests.conftest import auth, make_token

ADMIN = "/api/v1/admin/users"
FAKE = "0" * 24


async def test_users_routes_need_a_token_and_the_right_scope(client: httpx.AsyncClient) -> None:
    assert (await client.get(ADMIN)).status_code == 401
    nobody = auth(make_token(["enquiries:read"]))
    assert (await client.get(ADMIN, headers=nobody)).status_code == 403
    reader = auth(make_token(["users:read"]))
    for method, path, body in (
        ("POST", ADMIN, {"name": "Grace Okello", "email": "grace@gmail.com", "scopes": []}),
        ("PATCH", f"{ADMIN}/{FAKE}", {"active": False}),
        ("POST", f"{ADMIN}/{FAKE}/reset-password", {}),
        ("POST", f"{ADMIN}/{FAKE}/sign-out", {}),
    ):
        r = await client.request(method, path, json=body, headers=reader)
        assert r.status_code == 403, path


async def test_set_password_checks_the_body_and_is_rate_limited(
    client: httpx.AsyncClient,
) -> None:
    url = "/api/v1/auth/set-password"
    short = await client.post(url, json={"token": "t" * 30, "password": "short"})
    assert short.status_code == 422 and "password" in short.json()["error"]["fields"]
    for _ in range(9):
        await client.post(url, json={"token": "t", "password": "x"})
    assert (await client.post(url, json={"token": "t", "password": "x"})).status_code == 429
