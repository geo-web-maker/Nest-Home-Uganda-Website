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


def planned(next_apk="1.0.0", next_web="0.0.1", **over):
    base = {
        "current_apk": None,
        "current_web": None,
        "next_apk": next_apk,
        "next_web": next_web,
        "min_native_version_code": 1,
    }
    return {**base, **over}


@pytest.fixture
def plan(monkeypatch):
    """The release records are replaced by a plan the test sets."""
    state = {"value": planned()}

    async def fake_plan(app):
        return state["value"]

    monkeypatch.setattr(gb.planner, "plan", fake_plan)
    return state


def routes_for(tag="nurse-v1.0.0", tag_exists=False, create=201, runs=None, delete=204):
    return {
        ("GET", f"/repos/acme/nest/git/ref/tags/{tag}"): httpx.Response(
            200 if tag_exists else 404, json={}
        ),
        ("GET", "/repos/acme/nest/git/ref/heads/main"): httpx.Response(
            200, json={"object": {"sha": "abc123"}}
        ),
        ("GET", "/repos/acme/nest/actions/runs"): httpx.Response(
            200, json={"workflow_runs": runs or []}
        ),
        ("DELETE", f"/repos/acme/nest/git/refs/tags/{tag}"): httpx.Response(delete, json={}),
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


async def test_first_apk_is_tagged_at_the_branch_head_without_touching_package_json(
    configured, monkeypatch, plan
):
    calls: list = []
    fake_github(monkeypatch, routes_for(), calls)
    result = await gb.start_build("nurse-apk", "")
    assert result == {"tag": "nurse-v1.0.0", "sha": "abc123", "target": "nurse-apk"}
    assert not any(c[0] == "PUT" for c in calls)
    assert calls[-1][2] == {"ref": "refs/tags/nurse-v1.0.0", "sha": "abc123"}


async def test_web_update_gets_the_next_counter_value_by_itself(configured, monkeypatch, plan):
    plan["value"] = planned(current_apk="1.0.0", next_apk="2.0.0", next_web="1.0.8")
    fake_github(monkeypatch, routes_for(tag="nurse-web-v1.0.8"), [])
    (item,) = await gb.start_builds([("nurse-web", "")])
    assert item["ok"] and item["tag"] == "nurse-web-v1.0.8" and item["version"] == "1.0.8"


async def test_apk_after_a_release_is_the_next_whole_number(configured, monkeypatch, plan):
    plan["value"] = planned(current_apk="1.0.0", next_apk="2.0.0", next_web="1.0.8")
    fake_github(monkeypatch, routes_for(tag="nurse-v2.0.0"), [])
    (item,) = await gb.start_builds([("nurse-apk", "")])
    assert item["tag"] == "nurse-v2.0.0"


async def test_a_typed_version_must_match_the_automatic_one(configured, monkeypatch, plan):
    calls: list = []
    fake_github(monkeypatch, routes_for(), calls)
    for target, version in [("nurse-apk", "2.0.0"), ("nurse-web", "1.0.5"), ("nurse-apk", "1.0.1")]:
        with pytest.raises(HTTPException) as err:
            await gb.start_builds([(target, version)])
        assert err.value.status_code == 409
    assert not any(c[0] in ("DELETE", "POST") for c in calls)


async def test_a_full_web_counter_asks_for_a_new_apk(configured, monkeypatch, plan):
    plan["value"] = planned(current_apk="1.0.0", next_apk="2.0.0", next_web=None)
    fake_github(monkeypatch, routes_for(), [])
    with pytest.raises(HTTPException) as err:
        await gb.start_builds([("nurse-web", "")])
    assert err.value.status_code == 409 and "full" in err.value.detail


async def test_apk_and_web_for_the_same_app_cannot_be_batched(configured):
    with pytest.raises(HTTPException) as err:
        await gb.start_builds([("nurse-apk", ""), ("nurse-web", "")])
    assert err.value.status_code == 422


async def test_failed_build_tag_is_replaced_so_the_same_number_is_retried(
    configured, monkeypatch, plan
):
    calls: list = []
    fake_github(monkeypatch, routes_for(tag_exists=True), calls)
    (item,) = await gb.start_builds([("nurse-apk", "")])
    assert item["ok"] and item["tag"] == "nurse-v1.0.0"
    methods = [c[0] for c in calls]
    assert methods.index("DELETE") < methods.index("POST")


async def test_a_tag_that_is_still_building_is_left_alone(configured, monkeypatch, plan):
    calls: list = []
    running = [{"head_branch": "nurse-v1.0.0", "status": "in_progress"}]
    fake_github(monkeypatch, routes_for(tag_exists=True, runs=running), calls)
    (item,) = await gb.start_builds([("nurse-apk", "")])
    assert not item["ok"] and "still building" in item["error"]
    assert not any(c[0] in ("DELETE", "POST") for c in calls)


async def test_start_build_rejects_bad_input(configured):
    for target, version in [("nurse-apk", "1.0"), ("nurse-apk", "v1.0.0"), ("evil", "1.0.0")]:
        with pytest.raises(HTTPException) as err:
            await gb.start_builds([(target, version)])
        assert err.value.status_code == 422


async def test_github_refusing_the_token_is_reported_not_leaked(configured, monkeypatch, plan):
    routes = routes_for()
    routes[("GET", "/repos/acme/nest/git/ref/tags/nurse-v1.0.0")] = httpx.Response(401, json={})
    fake_github(monkeypatch, routes, [])
    with pytest.raises(HTTPException) as err:
        await gb.start_builds([("nurse-apk", "")])
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


def test_automatic_web_updates_from_a_push_are_listed_too():
    auto = gb.summarise_run(
        run(head_branch="main", name="web-bundle-release", head_sha="abcdef123456")
    )
    assert auto["tag"] == "web update (main abcdef1)"
    assert gb.summarise_run(run(head_branch="main", name="ci")) is None
