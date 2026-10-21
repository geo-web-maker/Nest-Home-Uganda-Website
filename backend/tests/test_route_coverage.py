"""S5.22: route coverage and drift guards, all generated from the registered routes.

These sit beside `test_scope_enforcement.py` (BUILDER_INSTRUCTIONS 12.6 tests 1 and 2, which
already run over every `/api/v1/admin` route from `iter_api_routes()`). They add three checks:

1. A route outside `/admin` that changes data must be on a short, explicit allow-list.
2. Every API call the frontend source makes matches a real backend route (path and method).
3. The committed `openapi.json` lists the same paths and schemas as the running app, so
   `api.d.ts` cannot silently go stale. Fix a failure here with `bash scripts/gen-types.sh`.

No test here needs a database.
"""

import json
import re
from pathlib import Path

import pytest

from app.main import app
from app.registry import API_PREFIX, iter_api_routes

ROOT = Path(__file__).resolve().parents[2]
FRONTEND_SRC = ROOT / "frontend" / "src"
OPENAPI_JSON = FRONTEND_SRC / "types" / "openapi.json"

WRITE_METHODS = {"POST", "PATCH", "PUT", "DELETE"}

# Data-changing routes that are allowed without an admin scope. Each one is public on purpose
# (a visitor form, a click counter) or is part of signing in. Adding a route here is a decision.
PUBLIC_WRITES: frozenset[tuple[str, str]] = frozenset(
    {
        ("POST", "/api/v1/public/enquiries"),
        ("POST", "/api/v1/public/applications"),
        ("POST", "/api/v1/public/clicks"),
        ("POST", "/api/v1/auth/login"),
        ("POST", "/api/v1/auth/refresh"),
        ("POST", "/api/v1/auth/logout"),
        ("POST", "/api/v1/auth/set-password"),
    }
)


def all_cases() -> list[tuple[str, str]]:
    out = []
    for path, route in iter_api_routes():
        for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
            out.append((method, path))
    return out


def test_every_route_is_public_auth_or_admin() -> None:
    allowed = ("/api/v1/admin", "/api/v1/public", "/api/v1/auth")
    stray = [(m, p) for m, p in all_cases() if not p.startswith(allowed)]
    assert not stray, f"routes outside admin, public and auth: {stray}"


def test_public_routes_only_read_or_are_allow_listed() -> None:
    writes = {
        (m, p)
        for m, p in all_cases()
        if m in WRITE_METHODS and not p.startswith("/api/v1/admin")
    }
    assert writes == set(PUBLIC_WRITES), (
        f"unexpected public writes: {sorted(writes - PUBLIC_WRITES)}; "
        f"allow-listed but missing: {sorted(PUBLIC_WRITES - writes)}"
    )


def test_every_admin_module_prefix_has_routes() -> None:
    """The nine screens and the content modules the admin calls must all be mounted."""
    paths = {p for _, p in all_cases()}
    for prefix in (
        "/api/v1/admin/dashboard",
        "/api/v1/admin/enquiries",
        "/api/v1/admin/jobs",
        "/api/v1/admin/applications",
        "/api/v1/admin/services",
        "/api/v1/admin/team",
        "/api/v1/admin/faqs",
        "/api/v1/admin/testimonials",
        "/api/v1/admin/areas",
        "/api/v1/admin/pricing",
        "/api/v1/admin/articles",
        "/api/v1/admin/pages",
        "/api/v1/admin/media",
        "/api/v1/admin/settings",
        "/api/v1/admin/users",
        "/api/v1/admin/reports/summary",
        "/api/v1/admin/reports/export",
        "/api/v1/admin/activity",
        "/api/v1/admin/scopes",
    ):
        assert any(p == prefix or p.startswith(prefix + "/") for p in paths), prefix


# ---- frontend calls against backend routes ---------------------------------------------------

CALL = re.compile(
    r"\b(?:apiClient|client)\s*\.\s*(get|post|patch|put|delete)\s*(?:<.*?>)?\s*\(\s*"
    r"(['`])(/.*?)\2",
    re.DOTALL,
)
FETCH_PATH = re.compile(r"/api/v1(/(?:admin|public|auth)/[A-Za-z0-9_/\-]+)")
TABS = re.compile(r"const tabs: ContentKind\[\] = \[(.*?)\];", re.DOTALL)


def _segments(path: str) -> list[str]:
    return [s for s in path.split("/") if s]


def _matches(template: str, route_path: str) -> bool:
    """A `{param}` segment in the route, or a `${...}` hole in the call, matches any segment."""
    want, have = _segments(template), _segments(route_path)
    if len(want) != len(have):
        return False
    for w, h in zip(want, have, strict=True):
        if w.startswith("{") or h.startswith("{"):
            continue
        if w != h:
            return False
    return True


def _content_tabs() -> list[str]:
    text = (FRONTEND_SRC / "features/admin/content/ContentPage.tsx").read_text()
    found = TABS.search(text)
    assert found, "ContentPage.tsx no longer declares `const tabs: ContentKind[]`"
    return re.findall(r"'([a-z_]+)'", found.group(1))


def frontend_calls() -> list[tuple[str, str, str]]:
    """(file, METHOD, path template) for every call in non-test source."""
    tabs = _content_tabs()
    calls: list[tuple[str, str, str]] = []
    for file in sorted(FRONTEND_SRC.rglob("*.ts*")):
        rel = str(file.relative_to(FRONTEND_SRC))
        if ".test." in rel or rel.startswith("types/") or rel.endswith(".d.ts"):
            continue
        text = file.read_text()
        found = [(m.group(1).upper(), m.group(3)) for m in CALL.finditer(text)]
        # Plain `fetch` calls (file upload, export) carry the full /api/v1 path.
        method_for_fetch = "POST" if "method: 'POST'" in text else "GET"
        found += [(method_for_fetch, m.group(1)) for m in FETCH_PATH.finditer(text)]
        for method, raw in found:
            path = re.sub(r"\?.*$", "", raw)
            if path.startswith("/admin/${tab}"):
                for tab in tabs:
                    calls.append((rel, method, path.replace("${tab}", tab)))
                continue
            calls.append((rel, method, re.sub(r"\$\{[^}]*\}", "{x}", path)))
    return calls


def test_frontend_source_is_scanned() -> None:
    calls = frontend_calls()
    assert len(calls) >= 40, f"only {len(calls)} calls found; the scanner regex has drifted"
    assert any(p.startswith("/admin/jobs") for _, _, p in calls)
    assert any(p.startswith("/public/applications") for _, _, p in calls)


@pytest.mark.parametrize(
    ("file", "method", "path"),
    sorted(set(frontend_calls())),
)
def test_frontend_call_has_a_backend_route(file: str, method: str, path: str) -> None:
    full = path if path.startswith(API_PREFIX) else API_PREFIX + path
    routes = [(p, r) for p, r in iter_api_routes() if _matches(full, p)]
    assert routes, f"{file}: {method} {full} matches no backend route"
    assert any(method in r.methods for _, r in routes), (
        f"{file}: {method} {full} exists only for "
        f"{sorted({m for _, r in routes for m in r.methods})}"
    )


# ---- committed OpenAPI export -----------------------------------------------------------------


def test_committed_openapi_matches_the_app() -> None:
    """Stale generated types make `tsc` lie. Regenerate with `bash scripts/gen-types.sh`."""
    committed = json.loads(OPENAPI_JSON.read_text())
    live = app.openapi()
    assert set(committed["paths"]) == set(live["paths"]), (
        "openapi.json paths differ from the app: run `bash scripts/gen-types.sh` and commit"
    )
    assert set(committed["components"]["schemas"]) == set(live["components"]["schemas"]), (
        "openapi.json schemas differ from the app: run `bash scripts/gen-types.sh` and commit"
    )
