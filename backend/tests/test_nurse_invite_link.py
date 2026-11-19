import pytest

pytest.importorskip("beanie")

from app.modules.users import service  # noqa: E402


class _S:
    def __init__(self, admin, nurse=""):
        self.frontend_url, self.nurse_frontend_url = admin, nurse


def test_nurse_link_uses_nurse_url_when_set(monkeypatch):
    monkeypatch.setattr(service, "get_settings", lambda: _S("https://bhcug.com/", "https://nurse.bhcug.com/"))
    assert service._link("t", purpose="invite", nurse=True) == "https://nurse.bhcug.com/set-password?token=t&purpose=invite"
    assert service._link("t", purpose="invite").startswith("https://bhcug.com/admin/set-password")


def test_nurse_link_falls_back_to_admin_url(monkeypatch):
    monkeypatch.setattr(service, "get_settings", lambda: _S("https://bhcug.com", ""))
    assert service._link("t", nurse=True).startswith("https://bhcug.com/admin/set-password")
