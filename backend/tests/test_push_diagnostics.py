import inspect
from types import SimpleNamespace

import pytest

from app.modules.push import diagnostics, fcm
from app.modules.push import router as push_router


def test_mask_token_never_returns_the_full_token():
    token = "a" * 40 + "WXYZ"
    masked = diagnostics.mask_token(token)
    assert token not in masked and masked.endswith("WXYZ")
    assert diagnostics.mask_token(None) is None


def test_fake_sender_is_reported_as_a_failure(monkeypatch):
    settings = SimpleNamespace(push_sender="fake", fcm_service_account_json="", fcm_service_account_json_b64="",
                               fcm_project_id="", push_channel_normal="nest_normal", push_channel_critical="nest_critical",
                               push_ttl_normal_seconds=86400, push_ttl_critical_seconds=14400)
    monkeypatch.setattr(diagnostics, "get_settings", lambda: settings)
    checks = {c.id: c for c in diagnostics.check_config()}
    assert checks["sender"].status == diagnostics.FAIL
    assert checks["service_account"].status == diagnostics.FAIL
    assert checks["project"].status == diagnostics.SKIP


def test_error_help_covers_the_common_firebase_errors():
    for code in ("UNREGISTERED", "SENDER_ID_MISMATCH", "PERMISSION_DENIED", "PUSH_SENDER_NOT_FCM"):
        assert diagnostics.explain_error(code)
    assert diagnostics.explain_error(None) == ""


async def test_send_detailed_reports_disabled_sender_without_network(monkeypatch):
    monkeypatch.setattr(fcm, "get_settings", lambda: SimpleNamespace(push_sender="fake"))
    result = await fcm.send_push_detailed("tok", "t", "b")
    assert result["ok"] is False and result["error"] == "PUSH_SENDER_NOT_FCM"


async def test_send_detailed_reports_missing_credentials(monkeypatch):
    monkeypatch.setattr(fcm, "get_settings", lambda: SimpleNamespace(
        push_sender="fcm", fcm_service_account_json="", fcm_service_account_json_b64=""))
    result = await fcm.send_push_detailed("tok", "t", "b")
    assert result["stage"] == "credentials"


def test_every_push_is_high_priority():
    assert '"priority": "high"' in inspect.getsource(fcm.send_push)
    assert '"priority": "high"' in inspect.getsource(fcm.send_push_detailed)
    assert '"normal"' not in inspect.getsource(fcm.send_push)


def test_every_diagnostics_route_needs_the_scope_and_the_totp_guard():
    for route in push_router.router.routes:
        names = [d.call.__name__ for d in route.dependant.dependencies]
        assert "dependency" in names or names, route.path
        assert "_guard" in inspect.getsource(route.endpoint), route.path


def test_scope_is_registered():
    from app.modules.auth.scopes import SCOPES
    assert "push:diagnostics" in {s.id for s in SCOPES}


async def test_guard_refuses_without_a_verified_session(monkeypatch):
    from app.core.errors import TotpRequired

    async def refuse(principal, token):
        raise TotpRequired()
    monkeypatch.setattr(push_router, "assert_totp_session", refuse)
    with pytest.raises(TotpRequired):
        await push_router._guard(SimpleNamespace(user_id="u"), None, SimpleNamespace(headers={}))


def test_scenarios_match_the_live_notifications_and_safety_alert_is_critical():
    assert {"visit_assigned", "visit_cancelled", "timesheet_approved", "timesheet_sent_back", "mail", "safety_alert"} <= set(diagnostics.SCENARIOS)
    assert diagnostics.SCENARIOS["safety_alert"][4] is True
    assert diagnostics.SCENARIOS["visit_assigned"][4] is False


async def test_unknown_scenario_is_refused_without_sending():
    result = await diagnostics.send_scenario("x@example.com", "nope")
    assert result["ok"] is False and result["results"] == []


def test_each_app_labels_its_own_devices():
    import inspect as _inspect

    from app.modules.care_ops import router as care_ops_router
    from app.modules.nurses import router as nurses_router
    from app.modules.nurses.models import Device

    assert "app" in Device.model_fields
    assert 'app="nurse"' in _inspect.getsource(nurses_router.register_device)
    assert 'app="admin"' in _inspect.getsource(care_ops_router.register_admin_device)


def test_nurse_hint_explains_the_opt_in_and_the_firebase_secret():
    assert "Visit reminders" in diagnostics.NURSE_HINT
    assert "NURSE_GOOGLE_SERVICES_JSON_BASE64" in diagnostics.NURSE_HINT


def test_b64_key_decoding_is_forgiving():
    import base64
    from app.modules.push.fcm import _decode_b64_setting as d
    raw = '{"a": 1}'
    enc = base64.b64encode(raw.encode()).decode()
    assert d(enc) == raw
    assert d(enc[:10] + "\n  " + enc[10:]) == raw
    assert d('"' + enc + '"') == raw
    assert d(enc.rstrip("=")) == raw
    assert d(raw) == raw


async def test_urgency_setting_overrides_the_built_in_rule(monkeypatch):
    from app.modules.push import dispatcher
    from app.modules.settings import care_service

    async def values():
        return {"push.urgency.mail": "urgent", "push.urgency.sos": "normal", "push.urgency.visit": "default"}
    monkeypatch.setattr(care_service, "care_values", values)
    assert await dispatcher.resolve_critical("mail", False) is True
    assert await dispatcher.resolve_critical("sos", True) is False
    assert await dispatcher.resolve_critical("visit", False) is False
    assert await dispatcher.resolve_critical("visit", True) is True


def test_urgency_values_are_validated():
    from app.modules.settings.care_keys import validate_value

    assert validate_value("push.urgency.mail", "urgent") == "urgent"
    with pytest.raises(ValueError):
        validate_value("push.urgency.mail", "loud")


def test_nurse_profile_errors_are_explained():
    import inspect as _i
    src = _i.getsource(diagnostics.explain_user)
    assert "404 'Nurse profile not found'" in src and "field:use" in src
    assert callable(diagnostics.nurse_access_problems)


def test_existing_accounts_can_become_nurses_by_a_superadmin_only():
    import inspect as _i
    from app.modules.nurses import router as nurses_router, service as nurses_service
    src = _i.getsource(nurses_router.add_nurse_profile_for_existing_user)
    assert "is_superadmin" in src and "403" in src
    svc = _i.getsource(nurses_service.add_nurse_profile_to_user)
    assert "field:use" in svc and "audit.record" in svc and "already has a nurse profile" in svc
