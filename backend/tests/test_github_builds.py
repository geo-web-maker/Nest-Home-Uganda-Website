import base64
import json

import httpx
import pytest
from fastapi import HTTPException

from app.core.config import get_settings
from app.modules.app_releases import github_builds as gb


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv("NEST_GITHUB_REPO", "acme/nest")
    monkeypatch.setenv("NEST_GITHUB_TOKEN", "ghp_test")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def fake_github(monkeypatch, routes: dict[tuple[str, str], httpx.Response], calls: list):
    async def fake_request(method, path, **kwargs):
        calls.append((method, path, kwargs.get("json")))
        return routes[(method, path)]

    monkeypatch.setattr(gb, "_request", fake_request)


def package(version: str) -> httpx.Response:
    body = base64.b64encode(json.dumps({"version": version}).encode()).decode()
    return httpx.Response(200, json={"content": body})


def routes_for(version="1.0.0", tag_exists=False, create=201, put=200):
    return {
        ("GET", "/repos/acme/nest/contents/nurse/package.json"): package(version),
        ("GET", "/repos/acme/nest/git/ref/tags/nurse-v1.0.0"): httpx.Response(
            200 if tag_exists else 404, json={}
        ),
        ("GET", "/repos/acme/nest/git/ref/tags/nurse-v2.0.0"): httpx.Response(404, json={}),
        ("GET", "/repos/acme/nest/git/ref/tags/nurse-web-v1.0.1"): httpx.Response(404, json={}),
        ("GET", "/repos/acme/nest/git/ref/heads/main"): httpx.Response(
            200, json={"object": {"sha": "abc123"}}
        ),
        ("PUT", "/repos/acme/nest/contents/nurse/package.json"): httpx.Response(
            put, json={"commit": {"sha": "def456"}}
        ),
        ("POST", "/repos/acme/nest/git/refs"): httpx.Response(create, json={}),
    }


async def test_not_configured_is_a_clear_503(monkeypatch):
    monkeypatch.delenv("NEST_GITHUB_REPO", raising=False)
    monkeypatch.delenv("NEST_GITHUB_TOKEN", raising=False)
    get_settings.cache_clear()
    with pytest.raises(HTTPException) as err:
        await gb.list_builds()
    assert err.value.status_code == 503
    assert "NEST_GITHUB_TOKEN" in err.value.detail


async def test_unbuilt_current_version_is_tagged_without_a_commit(configured, monkeypatch):
    calls: list = []
    fake_github(monkeypatch, routes_for(), calls)
    result = await gb.start_build("nurse-apk", "1.0.0")
    assert result == {"tag": "nurse-v1.0.0", "sha": "abc123", "target": "nurse-apk"}
    assert not any(c[0] == "PUT" for c in calls)


async def test_apk_raises_the_first_number_and_commits_package_json(configured, monkeypatch):
    calls: list = []
    fake_github(monkeypatch, routes_for(), calls)
    (item,) = await gb.start_builds([("nurse-apk", "2.0.0")])
    assert item["ok"] and item["tag"] == "nurse-v2.0.0" and item["sha"] == "def456"
    put = next(c for c in calls if c[0] == "PUT")
    assert json.loads(base64.b64decode(put[2]["content"]))["version"] == "2.0.0"
    assert calls[-1][2] == {"ref": "refs/tags/nurse-v2.0.0", "sha": "def456"}


async def test_web_update_changes_inner_numbers_only(configured, monkeypatch):
    fake_github(monkeypatch, routes_for(), [])
    (item,) = await gb.start_builds([("nurse-web", "1.0.1")])
    assert item["ok"] and item["tag"] == "nurse-web-v1.0.1"
    for target, version in [("nurse-web", "2.0.0"), ("nurse-apk", "1.1.0"), ("nurse-apk", "1.0.1"), ("nurse-apk", "3.0.0")]:
        with pytest.raises(HTTPException) as err:
            await gb.start_builds([(target, version)])
        assert err.value.status_code == 409


async def test_a_lower_version_is_refused_and_nothing_is_written(configured, monkeypatch):
    calls: list = []
    fake_github(monkeypatch, routes_for(version="1.2.0"), calls)
    with pytest.raises(HTTPException) as err:
        await gb.start_builds([("nurse-web", "1.1.5")])
    assert err.value.status_code == 409 and "lower" in err.value.detail
    assert not any(c[0] in ("PUT", "POST") for c in calls)


async def test_apk_and_web_for_the_same_app_cannot_be_batched(configured):
    with pytest.raises(HTTPException) as err:
        await gb.start_builds([("nurse-apk", "2.0.0"), ("nurse-web", "1.0.1")])
    assert err.value.status_code == 422


async def test_start_build_refuses_an_existing_tag(configured, monkeypatch):
    calls: list = []
    fake_github(monkeypatch, routes_for(tag_exists=True), calls)
    with pytest.raises(HTTPException) as err:
        await gb.start_builds([("nurse-apk", "1.0.0")])
    assert err.value.status_code == 409
    assert not any(c[0] in ("PUT", "POST") for c in calls)


async def test_start_build_rejects_bad_input(configured):
    for target, version in [("nurse-apk", "1.0"), ("nurse-apk", "v1.0.0"), ("evil", "1.0.0")]:
        with pytest.raises(HTTPException) as err:
            await gb.start_builds([(target, version)])
        assert err.value.status_code == 422


async def test_github_refusing_the_token_is_reported_not_leaked(configured, monkeypatch):
    routes = routes_for()
    routes[("GET", "/repos/acme/nest/contents/nurse/package.json")] = httpx.Response(401, json={})
    fake_github(monkeypatch, routes, [])
    with pytest.raises(HTTPException) as err:
        await gb.start_builds([("nurse-apk", "2.0.0")])
    assert err.value.status_code == 502
    assert "ghp_test" not in err.value.detail


def run(**over):
    base = {
        "id": 1,
        "run_number": 7,
        "head_branch": "nurse-v1.0.0",
        "event": "push",
        "name": "Nurse release",
        "status": "completed",
        "conclusion": "success",
        "created_at": "t0",
        "updated_at": "t1",
        "html_url": "u",
    }
    return {**base, **over}


def test_run_states_and_filtering():
    assert gb.summarise_run(run())["state"] == "succeeded"
    assert gb.summarise_run(run(status="in_progress", conclusion=None))["state"] == "running"
    assert gb.summarise_run(run(status="queued", conclusion=None))["state"] == "queued"
    assert gb.summarise_run(run(conclusion="failure"))["state"] == "failed"
    assert gb.summarise_run(run(conclusion="cancelled"))["state"] == "cancelled"
    assert gb.summarise_run(run(head_branch="main")) is None  # ordinary pushes are not builds
    assert gb.summarise_run(run(event="pull_request")) is None
