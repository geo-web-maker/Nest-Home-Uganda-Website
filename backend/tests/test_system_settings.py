import asyncio

import pytest

from app.core.deps import Principal
from app.core.errors import Forbidden, ValidationFailed
from app.modules.settings import service
from app.modules.settings.defaults import setting_defaults


def test_system_settings_have_documented_defaults():
    values = setting_defaults()
    assert values["system.MAINTENANCE_MODE"] is False
    assert values["system.ENABLE_USER_REGISTRATION"] is True
    assert values["system.ENABLE_BETA_FEATURES"] is False
    assert values["system.MAX_DAILY_VISITS"] == 50
    assert values["system.MAX_ITEMS_PER_USER"] == 100
    assert values["system.SESSION_TIMEOUT_MINUTES"] == 30
    assert values["system.MAX_UPLOAD_SIZE_MB"] == 10
    assert values["system.DEFAULT_SENDER_EMAIL"]
    assert values["system.SMS_NOTIFICATIONS_ENABLED"] is False
    assert values["system.WEBHOOK_RETRY_ATTEMPTS"] == 3
    assert values["system.PAYMENT_GATEWAY_MODE"] == "sandbox"
    assert values["system.API_REQUEST_TIMEOUT_SEC"] == 30
    assert values["system.SYNC_CRON_INTERVAL_MIN"] == 15
    assert values["system.PLATFORM_SITE_NAME"]
    assert values["system.DEFAULT_TIMEZONE"] == "Africa/Kampala"
    assert values["system.SUPPORT_CONTACT_EMAIL"]


def test_system_manager_is_required_for_system_group():
    principal = Principal("u", frozenset({"settings:write"}), False)
    with pytest.raises(Forbidden):
        asyncio.run(service.patch_group(principal, "system", {"MAINTENANCE_MODE": True}, None))


def test_system_validation_rejects_unsafe_gateway_mode(monkeypatch):
    async def fake_values():
        return setting_defaults()

    async def fake_set_value(key, value):
        raise AssertionError("invalid values must not be persisted")

    monkeypatch.setattr(service.repo, "get_values", fake_values)
    monkeypatch.setattr(service.repo, "set_value", fake_set_value)

    principal = Principal("u", frozenset({"system:manage"}), False)
    with pytest.raises(ValidationFailed):
        asyncio.run(
            service.patch_group(
                principal, "system", {"PAYMENT_GATEWAY_MODE": "live"}, None
            )
        )


async def test_system_settings_endpoint_requires_system_manage(client):
    from tests.conftest import auth, make_token

    response = await client.get(
        "/api/v1/admin/settings/system", headers=auth(make_token(["settings:read"]))
    )
    assert response.status_code == 403


async def test_system_settings_endpoint_accepts_system_manage(client):
    from tests.conftest import auth, make_token

    response = await client.get(
        "/api/v1/admin/settings/system", headers=auth(make_token(["system:manage"]))
    )
    assert response.status_code not in (401, 403)
