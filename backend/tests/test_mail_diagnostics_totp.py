from types import SimpleNamespace

import pytest

from app.core.errors import Forbidden
from app.modules.mail import router as mail_router


async def test_diagnostics_totp_rejects_missing_cookie(monkeypatch):
    async def current(user_id, token):
        return False
    monkeypatch.setattr(mail_router, "is_current_totp_session", current)
    with pytest.raises(Forbidden, match="authenticator code"):
        await mail_router._require_diagnostics_totp(SimpleNamespace(user_id="admin"), None)


async def test_diagnostics_totp_rejects_invalid_cookie_even_if_scope_configuration_is_open(monkeypatch):
    # The helper intentionally does not read mail.require_totp_for_scopes.
    async def current(user_id, token):
        return False
    monkeypatch.setattr(mail_router, "is_current_totp_session", current)
    with pytest.raises(Forbidden):
        await mail_router._require_diagnostics_totp(SimpleNamespace(user_id="admin"), "forged")


async def test_diagnostics_totp_accepts_a_verified_session(monkeypatch):
    async def current(user_id, token):
        return token == "valid"
    monkeypatch.setattr(mail_router, "is_current_totp_session", current)
    await mail_router._require_diagnostics_totp(SimpleNamespace(user_id="admin"), "valid")


def test_every_active_diagnostics_route_calls_the_mandatory_totp_guard():
    import inspect

    actions = (
        mail_router.mail_diagnostics_run,
        mail_router.mail_diagnostics_loopback,
        mail_router.mail_diagnostics_inbound,
        mail_router.mail_test_send,
        mail_router.mail_test_send_trace,
        mail_router.mail_inbound_trace,
    )
    for action in actions:
        assert "_require_diagnostics_totp" in inspect.getsource(action), action.__name__



def test_embedded_mongo_migrations_are_discoverable_before_startup():
    from pathlib import Path

    package_root = Path(__file__).resolve().parents[1]
    migration_dir = package_root / "migrations"
    assert migration_dir.is_dir()
    assert any(migration_dir.glob("[0-9][0-9][0-9][0-9]_*.py"))
