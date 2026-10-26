"""Error shape, CSRF, rate limits and headers. No database needed."""

import httpx

from tests.conftest import auth, make_token


async def test_health_has_security_headers_and_no_store(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["database"] == "off"
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["cache-control"] == "no-store"


async def test_unknown_route_uses_error_shape(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/v1/nope")
    assert r.status_code == 404
    assert r.json() == {"error": {"code": "not_found", "message": "Not found."}}


async def test_unauthorised_uses_error_shape(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/v1/admin/services")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorised"
    assert r.headers["www-authenticate"] == "Bearer"


async def test_forbidden_uses_error_shape(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/v1/admin/services", headers=auth(make_token(["jobs:read"])))
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "forbidden"


async def test_validation_error_lists_fields(client: httpx.AsyncClient) -> None:
    r = await client.post("/api/v1/auth/login", json={"email": "", "password": ""})
    assert r.status_code == 422
    body = r.json()["error"]
    assert body["code"] == "validation_error"
    assert set(body["fields"]) == {"email", "password"}


async def test_no_stack_trace_in_server_error(client: httpx.AsyncClient) -> None:
    # No database is connected here, so a valid admin call fails inside the handler.
    r = await client.get("/api/v1/admin/services", headers=auth(make_token([], superadmin=True)))
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "server_error"
    assert "Traceback" not in r.text


async def test_login_is_rate_limited(client: httpx.AsyncClient) -> None:
    for _ in range(10):
        assert (await client.post("/api/v1/auth/login", json={})).status_code == 422
    r = await client.post("/api/v1/auth/login", json={})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"
    assert int(r.headers["retry-after"]) > 0


async def test_refresh_needs_csrf_header_matching_cookie(client: httpx.AsyncClient) -> None:
    url = "/api/v1/auth/refresh"
    assert (await client.post(url)).status_code == 403
    client.cookies.set("nhc_csrf", "abc")
    r = await client.post(url, headers={"X-CSRF-Token": "different"})
    assert r.status_code == 403
    r = await client.post(url, headers={"X-CSRF-Token": "abc"})
    assert r.status_code == 401  # csrf ok, but no refresh cookie


async def test_logout_needs_csrf(client: httpx.AsyncClient) -> None:
    assert (await client.post("/api/v1/auth/logout")).status_code == 403


async def test_me_needs_a_token(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_openapi_has_no_role_words() -> None:
    from app.main import app

    spec = app.openapi()
    for name, body in spec["components"]["schemas"].items():
        # A team member's job title is a "role" field (spec 7.x Team); it is not an access role.
        if name.lower().startswith("team"):
            body.get("properties", {}).pop("role", None)
            body["required"] = [f for f in body.get("required", []) if f != "role"]
    assert "role" not in str(spec).lower().replace("rolling", "")
