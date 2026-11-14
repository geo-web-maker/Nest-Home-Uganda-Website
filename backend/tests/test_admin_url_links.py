from types import SimpleNamespace

from app.core.config import Settings
from app.modules.agreements import service as agreement_service
from app.modules.care_ops import dispatch as care_dispatch
from app.modules.mail import notify as mail_notify
from app.modules.users import service as user_service


def test_admin_url_defaults_to_frontend_url():
    settings = Settings(frontend_url="https://public.example")
    assert settings.admin_url == "https://public.example"


def test_admin_url_environment_override(monkeypatch):
    monkeypatch.setenv("NEST_ADMIN_URL", "https://admin.example")
    settings = Settings(frontend_url="https://public.example")
    assert settings.admin_url == "https://admin.example"


def test_user_set_password_link_uses_admin_origin(monkeypatch):
    monkeypatch.setattr(user_service, "get_settings", lambda: SimpleNamespace(admin_url="https://admin.example/"))
    assert user_service._link("secret", purpose="invite") == "https://admin.example/set-password?token=secret&purpose=invite"


def test_agreement_staff_link_uses_admin_origin(monkeypatch):
    monkeypatch.setattr(agreement_service, "get_settings", lambda: SimpleNamespace(admin_url="https://admin.example/"))
    assert agreement_service._admin_agreement_link("agreement-123") == "https://admin.example/agreements/agreement-123"


def test_care_operations_links_use_admin_origin(monkeypatch):
    monkeypatch.setattr(care_dispatch, "get_settings", lambda: SimpleNamespace(admin_url="https://admin.example/"))
    assert care_dispatch._admin_link("care/sos/case-123") == "https://admin.example/care/sos/case-123"
    assert care_dispatch._admin_link("/care/alerts") == "https://admin.example/care/alerts"
    assert care_dispatch._admin_link("/care/sos") == "https://admin.example/care/sos"


def test_mail_push_uses_root_mail_page():
    assert mail_notify.ADMIN_MAIL_PUSH_URL == "/mail"


def test_passkey_rp_and_origins_cover_admin_host(monkeypatch):
    from types import SimpleNamespace
    from app.modules.agreements import credentials

    cfg = SimpleNamespace(
        webauthn_rp_id="", webauthn_origins="",
        frontend_url="https://www.bhcug.com", admin_url="https://admin.bhcug.com",
    )
    monkeypatch.setattr(credentials, "get_settings", lambda: cfg)
    assert credentials._rp_id() == "bhcug.com"
    assert credentials._origins() == ["https://www.bhcug.com", "https://admin.bhcug.com"]
