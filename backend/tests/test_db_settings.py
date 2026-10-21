"""Settings routes against MongoDB, including public cache and permission boundaries."""

import httpx

from app.modules.audit.models import AuditLog
from app.modules.settings.models import SiteSetting
from app.modules.settings.service import seed_settings
from tests.conftest import auth, make_token

ADMIN = "/api/v1/admin/settings"
PUBLIC = "/api/v1/public/site"


def reader() -> dict[str, str]:
    return auth(make_token(["settings:read"]))


def editor() -> dict[str, str]:
    return auth(make_token(["settings:read", "settings:write"]))


def sms_admin() -> dict[str, str]:
    return auth(make_token(["settings:read", "settings:write", "system:manage"]))


def sms_scoped_only() -> dict[str, str]:
    return auth(make_token(["system:manage"]))


async def test_public_site_defaults_etag_and_private_fields(
    mongo: object, client: httpx.AsyncClient
) -> None:
    response = await client.get(f"{PUBLIC}?lang=en")
    assert response.status_code == 200
    data = response.json()
    assert data["business"]["phone"] == "0787 499 988"
    assert data["business"]["office"] == "Kampala, Uganda"
    assert data["business"]["hours"] == "Add opening hours"
    assert data["seo"]["index"] is False
    assert "notify" not in data and "sms" not in data
    assert response.headers["cache-control"] == "public, max-age=60"
    etag = response.headers["etag"]
    cached = await client.get(f"{PUBLIC}?lang=en", headers={"If-None-Match": etag})
    assert cached.status_code == 304 and cached.headers["etag"] == etag


async def test_admin_read_filters_sms_and_business_update_is_public_and_audited(
    mongo: object, client: httpx.AsyncClient
) -> None:
    response = await client.get(ADMIN, headers=reader())
    assert response.status_code == 200
    assert not any(row["group"] == "sms" for row in response.json())
    with_sms = await client.get(ADMIN, headers=sms_admin())
    assert any(row["key"] == "sms.provider" for row in with_sms.json())

    saved = await client.patch(
        f"{ADMIN}/business",
        json={"phone_display": "0777 111 222"},
        headers=editor(),
    )
    assert saved.status_code == 200
    public = (await client.get(PUBLIC)).json()
    assert public["business"]["phone"] == "0777 111 222"
    entry = await AuditLog.find_one(AuditLog.action == "settings.update")
    assert entry is not None and entry.before["business.phone_display"] == "0787 499 988"
    assert entry.after["business.phone_display"] == "0777 111 222"


async def test_sms_and_theme_validation(mongo: object, client: httpx.AsyncClient) -> None:
    denied = await client.patch(f"{ADMIN}/sms", json={"staff_enabled": False}, headers=editor())
    assert denied.status_code == 403
    allowed = await client.patch(
        f"{ADMIN}/sms", json={"staff_enabled": False}, headers=sms_admin()
    )
    assert allowed.status_code == 200
    sms_audit = await AuditLog.find_one(AuditLog.action == "settings.update")
    assert sms_audit is not None and sms_audit.scope == "system:manage"

    sms_only_read = await client.get(f"{ADMIN}/sms", headers=sms_scoped_only())
    assert sms_only_read.status_code == 200
    assert sms_only_read.json() and all(row["group"] == "sms" for row in sms_only_read.json())
    sms_only_save = await client.patch(
        f"{ADMIN}/sms", json={"staff_enabled": True}, headers=sms_scoped_only()
    )
    assert sms_only_save.status_code == 200
    sms_only_audit = await AuditLog.find_one(AuditLog.action == "settings.update")
    assert sms_only_audit is not None and sms_only_audit.scope == "system:manage"

    bad_theme = await client.patch(f"{ADMIN}/theme", json={"forest": "#FFFFFF"}, headers=editor())
    assert bad_theme.status_code == 422
    bad_home = await client.patch(
        f"{ADMIN}/home", json={"headline": "Welcome home", "accent": "comes home"}, headers=editor()
    )
    assert bad_home.status_code == 422
    reset = await client.post(f"{ADMIN}/theme/reset", json={}, headers=editor())
    assert reset.status_code == 200
    values = {item["key"]: item["value"] for item in reset.json()}
    assert values["theme.forest"] == "#123524"
    assert values["theme.gold"] == "#C79A3B"


async def test_unknown_setting_is_rejected_and_seed_is_idempotent(
    mongo: object, client: httpx.AsyncClient
) -> None:
    rejected = await client.patch(
        f"{ADMIN}/business", json={"not_a_setting": "x"}, headers=editor()
    )
    assert rejected.status_code == 422
    assert await seed_settings() >= 1
    first_count = await SiteSetting.count()
    assert await seed_settings() == 0
    assert await SiteSetting.count() == first_count
