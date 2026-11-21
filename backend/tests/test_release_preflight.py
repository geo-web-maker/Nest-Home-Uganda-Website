import httpx
import pytest

from app.core.config import get_settings
from app.modules.app_releases import github_builds as gb
from app.modules.app_releases import preflight as pf


def by_id(checks):
    return {c["id"]: c for c in checks}


@pytest.fixture
def env(monkeypatch):
    def set_env(**values):
        for key, value in values.items():
            if value is None:
                monkeypatch.delenv(key, raising=False)
            else:
                monkeypatch.setenv(key, value)
        get_settings.cache_clear()

    yield set_env
    get_settings.cache_clear()


def test_release_key_states(env):
    env(NEST_RELEASE_PUBLISH_KEY=None)
    assert pf.check_release_key()["status"] == "fail"
    env(NEST_RELEASE_PUBLISH_KEY="short")
    assert pf.check_release_key()["status"] == "fail"
    env(NEST_RELEASE_PUBLISH_KEY="k" * 40)
    assert pf.check_release_key()["status"] == "pass"


async def test_github_not_configured_fails_once_and_skips_the_rest(env):
    env(NEST_GITHUB_REPO=None, NEST_GITHUB_TOKEN=None)
    checks = by_id(await pf.check_github())
    assert checks["github_connection"]["status"] == "fail"
    assert checks["github_variables"]["status"] == "skip"
    assert all(c["status"] in ("fail", "skip") for c in checks.values())


@pytest.fixture(autouse=True)
def _planned_versions(monkeypatch):
    async def fake_plan(app):
        return {
            "current_apk": None,
            "current_web": None,
            "next_apk": "1.0.0",
            "next_web": "0.0.1",
            "min_native_version_code": 1,
        }

    monkeypatch.setattr(pf.planner, "plan", fake_plan)


def github(monkeypatch, overrides=None, record=None):
    routes = {
        ("GET", "/repos/a/b"): httpx.Response(200, json={}),
        ("GET", "/repos/a/b/git/ref/heads/main"): httpx.Response(
            200, json={"object": {"sha": "s1"}}
        ),
        ("GET", "/repos/a/b/actions/runs"): httpx.Response(200, json={}),
        ("POST", "/repos/a/b/git/refs"): httpx.Response(201, json={}),
        ("GET", "/repos/a/b/contents/.github/workflows"): httpx.Response(
            200, json=[{"name": n} for n in pf.WORKFLOWS]
        ),
        ("GET", "/repos/a/b/actions/secrets"): httpx.Response(
            200, json={"secrets": [{"name": n} for n in pf.REQUIRED_SECRETS]}
        ),
        ("GET", "/repos/a/b/actions/variables"): httpx.Response(
            200,
            json={
                "variables": [
                    {"name": "VITE_API_URL", "value": "https://host.example.com/nest"},
                    {
                        "name": "VITE_MAIL_STORAGE_URL",
                        "value": "https://acct.r2.cloudflarestorage.com",
                    },
                ]
            },
        ),
    }
    routes.update(overrides or {})

    async def fake(method, path, **kwargs):
        if record is not None:
            record.append((method, path))
        if method == "GET" and path.startswith("/repos/a/b/git/ref/tags/"):
            return routes.get((method, path), httpx.Response(404, json={}))
        if method == "DELETE":
            return routes.get((method, path), httpx.Response(204))
        return routes[(method, path)]

    monkeypatch.setattr(gb, "_request", fake)

    class Reach:
        def __init__(self, *a, **k): ...
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url):
            return httpx.Response(200, json={})

    monkeypatch.setattr(pf.httpx, "AsyncClient", Reach)


@pytest.fixture
def configured(env):
    env(NEST_GITHUB_REPO="a/b", NEST_GITHUB_TOKEN="tok")


async def test_everything_in_place_passes_and_cleans_up(configured, monkeypatch):
    seen: list = []
    github(monkeypatch, record=seen)
    checks = await pf.check_github()
    assert all(c["status"] == "pass" for c in checks), checks
    assert any(m == "DELETE" and "/git/refs/tags/preflight-" in p for m, p in seen)


async def test_missing_secret_names_are_listed(configured, monkeypatch):
    github(
        monkeypatch,
        {
            ("GET", "/repos/a/b/actions/secrets"): httpx.Response(
                200, json={"secrets": [{"name": "S3_KEY"}]}
            )
        },
    )
    check = by_id(await pf.check_github())["github_secrets"]
    assert check["status"] == "fail" and "RELEASE_PUBLISH_KEY" in check["detail"]


async def test_secret_and_variable_checks_skip_when_token_cannot_read_them(configured, monkeypatch):
    github(
        monkeypatch,
        {
            ("GET", "/repos/a/b/actions/secrets"): httpx.Response(403, json={}),
            ("GET", "/repos/a/b/actions/variables"): httpx.Response(403, json={}),
        },
    )
    checks = by_id(await pf.check_github())
    assert checks["github_secrets"]["status"] == "skip"
    assert checks["github_variables"]["status"] == "skip"


@pytest.mark.parametrize(
    ("api", "mail"),
    [
        ("https://host.example.com/nest/", "https://acct.r2.cloudflarestorage.com"),
        ("https://host.example.com/nest/api/v1", "https://acct.r2.cloudflarestorage.com"),
        ("http://host.example.com/nest", "https://acct.r2.cloudflarestorage.com"),
        ("https://10.0.0.1/nest", "https://acct.r2.cloudflarestorage.com"),
        ("https://host.example.com/nest", "https://acct.r2.cloudflarestorage.com/mail-bucket"),
        ("https://host.example.com/nest", "https://acct.r2.cloudflarestorage.com/"),
    ],
)
async def test_variable_format_mistakes_fail(configured, monkeypatch, api, mail):
    variables = {
        "variables": [
            {"name": "VITE_API_URL", "value": api},
            {"name": "VITE_MAIL_STORAGE_URL", "value": mail},
        ]
    }
    github(
        monkeypatch, {("GET", "/repos/a/b/actions/variables"): httpx.Response(200, json=variables)}
    )
    assert by_id(await pf.check_github())["github_variables"]["status"] == "fail"


async def test_token_that_cannot_create_tags_fails(configured, monkeypatch):
    github(monkeypatch, {("POST", "/repos/a/b/git/refs"): httpx.Response(403, json={})})
    assert by_id(await pf.check_github())["github_tag_permission"]["status"] == "fail"


async def test_version_already_tagged_warns(configured, monkeypatch):
    github(
        monkeypatch, {("GET", "/repos/a/b/git/ref/tags/nurse-v1.0.0"): httpx.Response(200, json={})}
    )
    checks = by_id(await pf.check_github())
    assert checks["nurse_version"]["status"] == "warn"
    assert checks["admin_version"]["status"] == "pass"


async def test_bucket_check_reports_kind_not_message(monkeypatch):
    class Broken:
        async def put(self, *a, **k):
            raise RuntimeError("secret-key-AKIA123 rejected")

    monkeypatch.setattr(pf, "get_storage", lambda: Broken())
    check = await pf.check_bucket()
    assert check["status"] == "fail"
    assert "AKIA123" not in check["detail"] and "RuntimeError" in check["detail"]


async def test_bucket_check_passes_with_a_working_store(monkeypatch):
    class Memory:
        def __init__(self):
            self.data = {}

        async def put(self, bucket, key, data, content_type):
            self.data[key] = data

        async def get(self, bucket, key):
            return self.data[key]

        async def delete(self, bucket, key):
            self.data.pop(key)

    store = Memory()
    monkeypatch.setattr(pf, "get_storage", lambda: store)
    assert (await pf.check_bucket())["status"] == "pass"
    assert store.data == {}
