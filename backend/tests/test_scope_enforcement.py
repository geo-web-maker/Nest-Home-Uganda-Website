"""BUILDER_INSTRUCTIONS 12.6 tests 1 and 2, generated from the registered routes.

A new admin endpoint without a scope fails here. These tests need no database:
authorisation is decided from the access token before any handler runs.
"""

import httpx
import pytest
from fastapi.routing import APIRoute

from app.core.deps import route_required_scopes
from app.modules.auth.scopes import ALL_SCOPE_IDS, read_scope_for
from app.registry import iter_api_routes
from tests.conftest import auth, make_token

FAKE_ID = "0" * 24
WRITE_METHODS = {"POST", "PATCH", "PUT", "DELETE"}
# Admin and field photo streams are the only exceptions: access is a short-lived HMAC URL,
# issued only after a scope/reach (or own-visit) check; the signature is verified in the handler.
SIGNED_PHOTO_STREAM = "/api/v1/admin/care/visits/{visit_id}/photos/{photo_id}/stream"
SIGNED_FIELD_PHOTO_STREAM = "/api/v1/field/visits/{visit_id}/photos/{photo_id}/stream"
SIGNED_PHOTO_STREAMS = {SIGNED_PHOTO_STREAM, SIGNED_FIELD_PHOTO_STREAM}
SUPERADMIN_ONLY_PATHS = {"/api/v1/admin/app-releases"}


def admin_cases() -> list[tuple[str, str]]:
    cases = []
    for path, route in iter_api_routes():
        if (
            path.startswith("/api/v1/admin") or path.startswith("/api/v1/field")
        ) and path not in SIGNED_PHOTO_STREAMS:
            for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
                cases.append((method, path))
    return cases


def write_cases() -> list[tuple[str, str]]:
    """Write endpoints that have a matching read scope (media:write has none)."""
    out = []
    for method, path in admin_cases():
        required = route_required_scopes(route_for(method, path)) or ()
        if method in WRITE_METHODS and any(read_scope_for(w) for w in required):
            out.append((method, path))
    return out


def route_for(method: str, path: str) -> APIRoute:
    return next(r for p, r in iter_api_routes() if p == path and method in r.methods)


def concrete(path: str) -> str:
    out = path
    while "{" in out:
        start, end = out.index("{"), out.index("}")
        out = out[:start] + FAKE_ID + out[end + 1 :]
    return out


async def call(client: httpx.AsyncClient, method: str, path: str, headers: dict) -> int:
    response = await client.request(method, concrete(path), headers=headers, json={})
    return response.status_code


def test_admin_routes_exist() -> None:
    paths = {p for _, p in admin_cases()}
    assert "/api/v1/admin/scopes" in paths
    assert "/api/v1/admin/services" in paths
    assert len(admin_cases()) >= 6


@pytest.mark.parametrize(("method", "path"), admin_cases())
def test_every_admin_route_declares_scopes(method: str, path: str) -> None:
    required = route_required_scopes(route_for(method, path))
    assert required, f"{method} {path} has no require_scopes dependency"
    assert set(required) <= ALL_SCOPE_IDS


@pytest.mark.parametrize(("method", "path"), admin_cases())
def test_read_and_write_split(method: str, path: str) -> None:
    required = route_required_scopes(route_for(method, path)) or ()
    if method == "GET":
        assert not any(s.endswith(":write") for s in required)
    if method in WRITE_METHODS:
        # Action-specific scopes are write capabilities too. They are intentionally
        # narrower than a broad module-wide :write grant (for example photos:hide).
        write_capabilities = (
            ":write",
            ":manage",
            ":hide",
            ":send",
            ":respond",
            ":approve",
            ":export",
            ":use",
        )
        assert any(s.endswith(write_capabilities) for s in required)


@pytest.mark.parametrize(("method", "path"), admin_cases())
async def test_no_token_is_401(client: httpx.AsyncClient, method: str, path: str) -> None:
    assert await call(client, method, path, {}) == 401


@pytest.mark.parametrize(("method", "path"), admin_cases())
async def test_garbage_token_is_401(client: httpx.AsyncClient, method: str, path: str) -> None:
    assert await call(client, method, path, auth("not.a.jwt")) == 401


@pytest.mark.parametrize(("method", "path"), admin_cases())
async def test_no_scopes_is_403(client: httpx.AsyncClient, method: str, path: str) -> None:
    assert await call(client, method, path, auth(make_token([]))) == 403


@pytest.mark.parametrize(("method", "path"), admin_cases())
async def test_unrelated_scope_is_403(client: httpx.AsyncClient, method: str, path: str) -> None:
    required = set(route_required_scopes(route_for(method, path)) or ())
    other = sorted(ALL_SCOPE_IDS - required)
    assert await call(client, method, path, auth(make_token(other))) == 403


@pytest.mark.parametrize(("method", "path"), write_cases())
async def test_read_scope_alone_cannot_write(
    client: httpx.AsyncClient, method: str, path: str
) -> None:
    required = route_required_scopes(route_for(method, path)) or ()
    reads = [r for w in required if (r := read_scope_for(w))]
    assert await call(client, method, path, auth(make_token(reads))) == 403


@pytest.mark.parametrize(("method", "path"), admin_cases())
async def test_exact_scopes_and_superadmin_pass_authorisation(
    client: httpx.AsyncClient, method: str, path: str
) -> None:
    """Passing means not 401 or 403. The handler may then fail (422, 404 or no database)."""
    required = list(route_required_scopes(route_for(method, path)) or ())
    scoped_headers = auth(make_token(required))
    if path in SUPERADMIN_ONLY_PATHS and method == "POST":
        response = await client.post(
            concrete(path),
            headers=scoped_headers,
            json={
                "id": "release-coverage-0001",
                "platform": "android",
                "version": "1.0.0",
                "min_supported_version": "1.0.0",
            },
        )
        scoped_status = response.status_code
    else:
        scoped_status = await call(client, method, path, scoped_headers)
    if path in SUPERADMIN_ONLY_PATHS:
        assert scoped_status == 403, "a non-superadmin must not publish or list releases"
    else:
        assert scoped_status not in (401, 403)
    assert await call(client, method, path, auth(make_token([], superadmin=True))) not in (401, 403)


def test_signed_photo_stream_is_the_only_admin_path_without_a_scope_dependency() -> None:
    paths = {path for path, _ in iter_api_routes() if path.startswith("/api/v1/admin")}
    assert SIGNED_PHOTO_STREAM in paths
    unscoped = [
        path
        for path, route in iter_api_routes()
        if path.startswith("/api/v1/admin") and route_required_scopes(route) is None
    ]
    assert unscoped == [SIGNED_PHOTO_STREAM]
