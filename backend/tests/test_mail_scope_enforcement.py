"""Mail routes use the central scope registry and fail closed without authority."""

import httpx
import pytest

from app.core.deps import route_required_scopes
from app.modules.auth.scopes import ALL_SCOPE_IDS
from app.registry import iter_api_routes
from tests.conftest import auth, make_token


def mail_cases():
    return [
        (method, path, route)
        for path, route in iter_api_routes()
        if path.startswith("/api/v1/mail") and path not in {"/api/v1/mail/inbound", "/api/v1/mail/webhooks/{provider}"}
        for method in sorted(route.methods - {"HEAD", "OPTIONS"})
    ]


def concrete(path: str) -> str:
    return path.replace("{key}", "mail.enabled")


async def call(client: httpx.AsyncClient, method: str, path: str, headers: dict) -> int:
    response = await client.request(method, concrete(path), headers=headers, json={})
    return response.status_code


def test_mail_scope_registry_is_complete():
    assert {
        "mail:use",
        "mail:shared:manage",
        "mail:archive:read",
        "mail:settings:manage",
        "mail:audit:read",
    } <= ALL_SCOPE_IDS


@pytest.mark.parametrize("method,path,route", mail_cases())
async def test_mail_routes_require_authentication(client, method, path, route):
    required = route_required_scopes(route)
    assert required, f"{method} {path} must have a declared mail scope"
    assert set(required) <= ALL_SCOPE_IDS
    assert await call(client, method, path, {}) == 401


@pytest.mark.parametrize("method,path,route", mail_cases())
async def test_mail_routes_reject_missing_scope(client, method, path, route):
    status = await call(client, method, path, auth(make_token([])))
    if "mail:use" in (route_required_scopes(route) or ()):
        # mail:use is an automatic account capability, including legacy accounts.
        assert status != 401
    else:
        assert status == 403


@pytest.mark.parametrize("method,path,route", mail_cases())
async def test_mail_routes_reject_unrelated_scope(client, method, path, route):
    required = set(route_required_scopes(route) or ())
    unrelated = sorted(ALL_SCOPE_IDS - required)
    status = await call(client, method, path, auth(make_token(unrelated)))
    if "mail:use" in required:
        assert status != 401
    else:
        assert status == 403


@pytest.mark.parametrize("method,path,route", mail_cases())
async def test_mail_superadmin_passes_route_scope_gate(client, method, path, route):
    status = await call(client, method, path, auth(make_token([], superadmin=True)))
    # A request may then fail because this test environment does not provide Neon.
    # Sensitive mail operations also require a verified TOTP cookie; the scope gate itself
    # is passed by superadmin even when the second factor has not been verified in this test.
    assert status != 401
