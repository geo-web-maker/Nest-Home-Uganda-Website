from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core import totp_guard
from app.core.errors import Forbidden


@pytest.mark.anyio
async def test_audit_totp_guard_rejects_missing_cookie_without_querying_enrollment(monkeypatch):
    async def should_not_run(_user_id):
        raise AssertionError("Enrollment lookup must not run without a valid signed cookie")

    monkeypatch.setattr(totp_guard, "valid_totp_session_cookie", lambda _user_id, _token: False)
    monkeypatch.setattr("app.modules.mail.totp.enrollment_epoch", should_not_run)

    with pytest.raises(Forbidden, match="Audit access is locked"):
        await totp_guard.assert_totp_session(SimpleNamespace(user_id="nurse-1"), None)


@pytest.mark.anyio
async def test_audit_totp_guard_accepts_valid_cookie_and_current_enrollment(monkeypatch):
    import time
    async def enrolled(_user_id):
        return 12345

    monkeypatch.setattr(totp_guard, "_parse_cookie", lambda _user_id, token: (int(time.time()) + 60, 12345) if token == "signed-valid" else None)
    monkeypatch.setattr("app.modules.mail.totp.enrollment_epoch", enrolled)

    await totp_guard.assert_totp_session(SimpleNamespace(user_id="nurse-1"), "signed-valid")


@pytest.mark.anyio
async def test_audit_totp_guard_rejects_cookie_after_authenticator_reset(monkeypatch):
    async def no_longer_enrolled(_user_id):
        return None

    monkeypatch.setattr(totp_guard, "_parse_cookie", lambda _user_id, _token: (int(__import__("time").time()) + 60, 123))
    monkeypatch.setattr("app.modules.mail.totp.enrollment_epoch", no_longer_enrolled)

    with pytest.raises(Forbidden, match="not enrolled"):
        await totp_guard.assert_totp_session(SimpleNamespace(user_id="nurse-1"), "old-signed-cookie")


@pytest.mark.anyio
async def test_audit_totp_guard_fails_closed_when_enrollment_store_is_unavailable(monkeypatch):
    async def unavailable(_user_id):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(totp_guard, "_parse_cookie", lambda _user_id, _token: (int(__import__("time").time()) + 60, 123))
    monkeypatch.setattr("app.modules.mail.totp.enrollment_epoch", unavailable)

    with pytest.raises(HTTPException) as caught:
        await totp_guard.assert_totp_session(SimpleNamespace(user_id="nurse-1"), "signed-valid")
    assert caught.value.status_code == 503
    assert "remain locked" in str(caught.value.detail)


def test_signed_totp_cookie_is_bound_to_user_expiry_and_enrollment(monkeypatch):
    import time
    from app.core.config import Settings
    monkeypatch.setattr("app.core.totp_guard.get_settings", None, raising=False) if False else None
    # Configure the explicit key source used by the TOTP cookie signer.
    monkeypatch.setattr("app.core.config.get_settings", lambda: SimpleNamespace(nest_mail_secret_key="s" * 40, secret_key=""))
    expires = int(time.time()) + 60
    token = totp_guard.sign_totp_session("nurse-1", expires, 12345)
    assert totp_guard.valid_totp_session_cookie("nurse-1", token)
    assert not totp_guard.valid_totp_session_cookie("nurse-2", token)
    assert not totp_guard.valid_totp_session_cookie("nurse-1", token + "tampered")
    expired = totp_guard.sign_totp_session("nurse-1", int(time.time()) - 1, 12345)
    assert not totp_guard.valid_totp_session_cookie("nurse-1", expired)


@pytest.mark.anyio
async def test_totp_dependency_returns_authenticated_principal(monkeypatch):
    principal = SimpleNamespace(user_id="nurse-1")

    async def enrolled(_user_id):
        return 12345

    monkeypatch.setattr(totp_guard, "_parse_cookie", lambda _user_id, token: (int(__import__("time").time()) + 60, 12345) if token == "signed-valid" else None)
    monkeypatch.setattr("app.modules.mail.totp.enrollment_epoch", enrolled)

    assert await totp_guard.require_totp_session(principal, "signed-valid") is principal


def test_every_audit_read_route_uses_the_totp_guard():
    import ast
    from pathlib import Path

    root = Path(__file__).resolve().parents[1] / "modules"
    expected = {
        "activity/router.py": ("activity_list", "require_totp_session"),
        "field/router.py": ("field_audit", "require_totp_session"),
        "mail/router.py": ("mail_audit", "require_totp_session"),
        "care_admin/router.py": ("visit_detail", "require_totp_session"),
        "care_ops/router.py": ("list_sos_drills", "require_totp_session"),
        "reports/router.py": ("report_export", "assert_totp_session"),
    }
    for relative, (function_name, marker) in expected.items():
        source = (root / relative).read_text()
        tree = ast.parse(source)
        function = next(
            node for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and node.name == function_name
        )
        function_source = ast.get_source_segment(source, function) or ""
        assert marker in function_source, f"{relative}:{function_name} is missing {marker}"


def test_totp_required_has_stable_code_and_is_a_forbidden():
    from app.core.errors import TotpRequired
    exc = TotpRequired()
    assert isinstance(exc, Forbidden) and exc.status_code == 403 and exc.code == "totp_required"
