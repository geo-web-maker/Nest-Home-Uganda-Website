import pytest

from app.modules.app_releases.rules import (
    compare_versions,
    effective_minimum_version,
    parse_version,
)
from app.modules.app_releases.schemas import AppReleaseCreate


def test_semver_numeric_and_stable_precedence():
    assert compare_versions("1.10.0", "1.9.9") > 0
    assert compare_versions("2.0.0", "2.0.0-rc.1") > 0
    assert compare_versions("1.2.3+build.1", "1.2.3+build.9") == 0


def test_semver_prerelease_uses_numeric_identifier_order():
    assert compare_versions("1.0.0-alpha.10", "1.0.0-alpha.2") > 0
    assert compare_versions("1.0.0-alpha.2", "1.0.0-alpha.beta") < 0
    assert compare_versions("1.0.0-alpha", "1.0.0-alpha.1") < 0


@pytest.mark.parametrize("value", ["1.0", "v1.0.0", "01.0.0", "1.0.0-01", "1.0.0-"])
def test_rejects_non_semver(value):
    with pytest.raises(ValueError):
        parse_version(value)


def test_release_rejects_external_or_scriptable_download_paths():
    base = {
        "id": "release-2026",
        "platform": "android",
        "version": "1.2.0",
        "min_supported_version": "1.0.0",
    }
    assert AppReleaseCreate(**base, download_path="/downloads/nurse.apk")
    for path in ("//evil.example/file", "javascript:alert(1)", "data:text/plain,x", "relative.apk"):
        with pytest.raises(ValueError):
            AppReleaseCreate(**base, download_path=path)


async def test_configured_minimum_can_raise_but_not_lower_release_floor():
    assert effective_minimum_version("1.2.0", "1.0.0") == "1.2.0"
    assert effective_minimum_version("1.2.0", "1.3.0") == "1.3.0"


async def test_app_release_administration_is_superadmin_only(client):
    from tests.conftest import auth, make_token

    headers = auth(make_token(["users:read", "care-reports:read"], user_id="a" * 24))
    response = await client.get("/api/v1/admin/app-releases", headers=headers)
    assert response.status_code == 403
