from app.modules.auth.app_access import admin_app_allowed
from app.modules.auth.scopes import ALL_SCOPE_IDS


def test_nurse_only_account_does_not_have_admin_app_access():
    assert admin_app_allowed({"field:use", "sos:send", "mail:use"}, False) is False


def test_any_non_nurse_scope_grants_admin_app_access():
    assert admin_app_allowed({"field:use", "sos:send", "mail:use", "dashboard:view"}, False) is True
    assert admin_app_allowed({"nurses:write"}, False) is True


def test_superadmin_has_admin_app_access_without_stored_scopes():
    assert admin_app_allowed(set(), True) is True


def test_every_registered_scope_is_classified_by_the_shared_rule():
    for scope in ALL_SCOPE_IDS:
        expected = scope not in {"field:use", "sos:send", "mail:use"}
        assert admin_app_allowed({scope}, False) is expected, scope
