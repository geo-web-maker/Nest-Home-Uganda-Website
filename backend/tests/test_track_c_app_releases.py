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


def test_web_bundle_release_needs_bundle_key_on_web_and_a_hash():
    base = {"id": "web-bundle-1", "version": "1.2.0", "min_supported_version": "1.0.0"}
    assert AppReleaseCreate(**base, platform="web", bundle_key="bundles/a.zip", sha256="a" * 64)
    with pytest.raises(ValueError):
        AppReleaseCreate(**base, platform="web", bundle_key="bundles/a.zip")
    with pytest.raises(ValueError):
        AppReleaseCreate(**base, platform="android", bundle_key="bundles/a.zip", sha256="a" * 64)


async def test_latest_web_bundle_is_public_and_gated_by_native_code(client):
    from app.modules.app_releases.models import AppRelease

    await AppRelease(
        id="web-nurse-1.2.0", platform="web", app="nurse", version="1.2.0",
        min_supported_version="1.0.0", bundle_key="bundles/n.zip", sha256="b" * 64,
        min_native_version_code=5,
    ).insert()
    old = await client.get("/api/v1/app-bundles/nurse/latest?native_code=4&current=1.0.0")
    assert old.json() == {"update": False}
    same = await client.get("/api/v1/app-bundles/nurse/latest?native_code=9&current=1.2.0")
    assert same.json() == {"update": False}
    other_app = await client.get("/api/v1/app-bundles/admin/latest?native_code=9&current=1.0.0")
    assert other_app.json() == {"update": False}
    fresh = await client.get("/api/v1/app-bundles/nurse/latest?native_code=9&current=1.0.0")
    body = fresh.json()
    assert body["update"] is True and body["version"] == "1.2.0" and body["sha256"] == "b" * 64


async def test_latest_apk_is_per_app_and_only_when_newer(client):
    from app.modules.app_releases.models import AppRelease

    await AppRelease(
        id="android-admin-1.3.0", platform="android", app="admin", version="1.3.0",
        min_supported_version="1.0.0", apk_key="apks/admin.apk", sha256="c" * 64,
    ).insert()
    nurse = await client.get("/api/v1/app-bundles/nurse/apk?current=1.0.0")
    assert nurse.json() == {"update": False}
    same = await client.get("/api/v1/app-bundles/admin/apk?current=1.3.0")
    assert same.json() == {"update": False}
    body = (await client.get("/api/v1/app-bundles/admin/apk?current=1.2.0")).json()
    assert body["update"] is True and body["version"] == "1.3.0" and body["sha256"] == "c" * 64


RELEASE_BODY = {
    "id": "android-nurse-v9.9.9",
    "platform": "android",
    "app": "nurse",
    "version": "9.9.9",
    "version_code": 7,
    "min_supported_version": "9.9.9",
    "apk_key": "apks/nurse-v9.9.9-7.apk",
    "sha256": "c" * 64,
    "size_bytes": 1234,
}


async def test_release_key_publishing_is_disabled_until_a_strong_key_is_set(client, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setenv("NEST_RELEASE_PUBLISH_KEY", "too-short")
    get_settings.cache_clear()
    try:
        response = await client.post(
            "/api/v1/app-bundles/releases", json=RELEASE_BODY, headers={"X-Release-Key": "too-short"}
        )
        assert response.status_code == 404
    finally:
        monkeypatch.delenv("NEST_RELEASE_PUBLISH_KEY")
        get_settings.cache_clear()


async def test_release_key_publishing_rejects_missing_or_wrong_key(client, monkeypatch):
    from app.core.config import get_settings

    key = "k" * 40
    monkeypatch.setenv("NEST_RELEASE_PUBLISH_KEY", key)
    get_settings.cache_clear()
    try:
        missing = await client.post("/api/v1/app-bundles/releases", json=RELEASE_BODY)
        wrong = await client.post(
            "/api/v1/app-bundles/releases", json=RELEASE_BODY, headers={"X-Release-Key": "x" * 40}
        )
        bearer = await client.post(
            "/api/v1/app-bundles/releases", json=RELEASE_BODY, headers={"Authorization": f"Bearer {key}"}
        )
        assert missing.status_code == wrong.status_code == bearer.status_code == 401
    finally:
        monkeypatch.delenv("NEST_RELEASE_PUBLISH_KEY")
        get_settings.cache_clear()


def test_release_key_cannot_reach_any_other_route():
    from app.registry import iter_api_routes

    keyed = [
        path
        for path, route in iter_api_routes()
        if any("release_key" in getattr(p, "name", "") or getattr(p, "alias", "") == "X-Release-Key"
               for p in route.dependant.header_params)
    ]
    # Publishing a release, and asking which web version number a build will get (read-only).
    assert sorted(keyed) == [
        "/api/v1/app-bundles/releases",
        "/api/v1/app-bundles/{app}/next-version",
    ]


async def test_next_web_version_needs_the_release_key(client, monkeypatch):
    from app.core.config import get_settings

    key = "k" * 40
    monkeypatch.setenv("NEST_RELEASE_PUBLISH_KEY", key)
    get_settings.cache_clear()
    try:
        missing = await client.get("/api/v1/app-bundles/nurse/next-version")
        wrong = await client.get(
            "/api/v1/app-bundles/nurse/next-version", headers={"X-Release-Key": "x" * 40}
        )
        assert missing.status_code == wrong.status_code == 401
    finally:
        monkeypatch.delenv("NEST_RELEASE_PUBLISH_KEY")
        get_settings.cache_clear()


async def test_next_web_version_is_disabled_without_a_strong_key(client, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setenv("NEST_RELEASE_PUBLISH_KEY", "short")
    get_settings.cache_clear()
    try:
        response = await client.get(
            "/api/v1/app-bundles/nurse/next-version", headers={"X-Release-Key": "short"}
        )
        assert response.status_code == 404
    finally:
        monkeypatch.delenv("NEST_RELEASE_PUBLISH_KEY")
        get_settings.cache_clear()


async def test_next_web_version_answers_with_the_planned_number(client, monkeypatch):
    from app.core.config import get_settings
    from app.modules.app_releases import planner

    key = "k" * 40
    monkeypatch.setenv("NEST_RELEASE_PUBLISH_KEY", key)
    get_settings.cache_clear()

    async def fake_plan(app):
        return {"current_apk": "2.0.0", "next_web": "2.0.4", "min_native_version_code": 9}

    monkeypatch.setattr(planner, "plan", fake_plan)
    try:
        ok = await client.get(
            "/api/v1/app-bundles/admin/next-version", headers={"X-Release-Key": key}
        )
        assert ok.status_code == 200
        assert ok.json() == {"version": "2.0.4", "min_native_version_code": 9, "apk_version": "2.0.0"}

        async def full(app):
            return {"current_apk": "2.0.0", "next_web": None, "min_native_version_code": 9}

        monkeypatch.setattr(planner, "plan", full)
        refused = await client.get(
            "/api/v1/app-bundles/admin/next-version", headers={"X-Release-Key": key}
        )
        assert refused.status_code == 409
    finally:
        monkeypatch.delenv("NEST_RELEASE_PUBLISH_KEY")
        get_settings.cache_clear()
