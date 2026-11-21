"""Start and watch release builds on GitHub from the admin app.

A build starts by creating the release tag on the default branch; the tag workflows then
build, sign, upload and publish. Nothing here can touch code, secrets or other workflows.
"""

import re
from typing import Any

import httpx
from fastapi import HTTPException

from app.core.config import get_settings
from app.modules.app_releases import planner, rules

API = "https://api.github.com"
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")
# target -> (tag prefix, package.json path, label)
TARGETS: dict[str, tuple[str, str, str]] = {
    "nurse-apk": ("nurse-v", "nurse/package.json", "Nurse Android app"),
    "admin-apk": ("admin-v", "admin/package.json", "Admin Android app"),
    "nurse-web": ("nurse-web-v", "nurse/package.json", "Nurse web update"),
    "admin-web": ("admin-web-v", "admin/package.json", "Admin web update"),
}
TAG_RE = re.compile(r"^(nurse|admin)(-web)?-v\d+\.\d+\.\d+$")


def _config() -> tuple[str, str, str]:
    s = get_settings()
    if not s.github_repo or not s.github_token or "/" not in s.github_repo:
        raise HTTPException(
            status_code=503,
            detail="GitHub is not set up. Set NEST_GITHUB_REPO and NEST_GITHUB_TOKEN "
            "on the backend.",
        )
    return s.github_repo, s.github_token, s.github_branch or "main"


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "nest-admin-builds",
    }


async def _request(method: str, path: str, **kwargs: Any) -> httpx.Response:
    _, token, _ = _config()
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
            return await client.request(method, f"{API}{path}", headers=_headers(token), **kwargs)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="GitHub could not be reached") from exc


def _fail(response: httpx.Response, what: str) -> HTTPException:
    if response.status_code in (401, 403):
        return HTTPException(
            status_code=502,
            detail=f"GitHub refused the token while {what}. "
            "Check it is valid and has access to the repository.",
        )
    if response.status_code == 404:
        return HTTPException(
            status_code=502, detail=f"GitHub could not find the repository or file while {what}."
        )
    return HTTPException(
        status_code=502, detail=f"GitHub returned {response.status_code} while {what}."
    )


AUTO_WORKFLOW = "web-bundle-release"


def summarise_run(run: dict[str, Any]) -> dict[str, Any] | None:
    ref = run.get("head_branch") or ""
    is_tag_build = bool(TAG_RE.match(ref))
    # A push to the branch that the web workflow publishes by itself is a build too.
    is_auto_web = run.get("name") == AUTO_WORKFLOW and not is_tag_build
    if run.get("event") != "push" or not (is_tag_build or is_auto_web):
        return None
    sha = str(run.get("head_sha") or "")[:7]
    tag = ref if is_tag_build else f"web update ({ref} {sha})".replace(" )", ")")
    status, conclusion = run.get("status"), run.get("conclusion")
    if status in ("queued", "waiting", "pending", "requested"):
        state = "queued"
    elif status == "in_progress":
        state = "running"
    elif conclusion == "success":
        state = "succeeded"
    elif conclusion in ("cancelled", "skipped"):
        state = "cancelled"
    else:
        state = "failed"
    return {
        "id": run["id"],
        "run_number": run.get("run_number"),
        "tag": tag,
        "name": run.get("name") or tag,
        "state": state,
        "created_at": run.get("created_at"),
        "updated_at": run.get("updated_at"),
        "url": run.get("html_url"),
    }


async def list_builds(limit: int = 15) -> dict[str, Any]:
    repo, _, _ = _config()
    response = await _request(
        "GET", f"/repos/{repo}/actions/runs", params={"per_page": 50, "event": "push"}
    )
    if response.status_code != 200:
        raise _fail(response, "reading build runs")
    items = [r for r in (summarise_run(x) for x in response.json().get("workflow_runs", [])) if r]
    return {"repo": repo, "items": items[:limit]}


APPS = ("nurse", "admin")


def _kind(target: str) -> str:
    return "web" if target.endswith("-web") else "apk"


def _app(target: str) -> str:
    return target.split("-", 1)[0]


async def build_versions() -> dict[str, Any]:
    """Current version per app and the version the next build of each kind will get.

    Numbers come from the releases that were really published, not from package.json:
    ``next.apk`` is the next whole number (2.0.0), ``next.web`` the next counter step of the
    current app (1.0.7 -> 1.0.8). ``next.web`` is None when the 99.99 counter is full.
    """
    apps: dict[str, Any] = {}
    for app in APPS:
        planned = await planner.plan(app)
        apps[app] = {
            "current": planned["current_web"] or planned["current_apk"] or "0.0.0",
            "current_apk": planned["current_apk"],
            "current_web": planned["current_web"],
            "next": {"apk": planned["next_apk"], "web": planned["next_web"]},
        }
    return {"apps": apps}


async def _tag_exists(repo: str, tag: str) -> bool:
    existing = await _request("GET", f"/repos/{repo}/git/ref/tags/{tag}")
    if existing.status_code == 200:
        return True
    if existing.status_code != 404:
        raise _fail(existing, "checking the tag")
    return False


async def _tag_is_building(repo: str, tag: str) -> bool:
    response = await _request(
        "GET", f"/repos/{repo}/actions/runs", params={"per_page": 50, "event": "push"}
    )
    if response.status_code != 200:
        raise _fail(response, "checking running builds")
    return any(
        r.get("head_branch") == tag
        and r.get("status") in ("queued", "waiting", "pending", "requested", "in_progress")
        for r in response.json().get("workflow_runs", [])
    )


async def _clear_failed_tag(repo: str, tag: str) -> None:
    """A tag with no published release is a failed build: remove it so the number is retried."""
    if await _tag_is_building(repo, tag):
        raise HTTPException(
            status_code=409, detail=f"{tag} is still building. Wait for it to finish."
        )
    deleted = await _request("DELETE", f"/repos/{repo}/git/refs/tags/{tag}")
    if deleted.status_code not in (204, 404):
        raise _fail(deleted, "removing the tag of the failed build")


async def start_builds(items: list[tuple[str, str]]) -> list[dict[str, Any]]:
    """Start several builds at once.

    The version is chosen by the server (see build_versions); an item may pass it only to
    confirm it. Everything is checked first and nothing is changed if any item is invalid.
    The tag is created on the head of the branch and the tag workflow builds, signs and
    publishes it, taking the version from the tag. A failure while writing is reported on its
    item and does not stop the others.
    """
    if not items:
        raise HTTPException(status_code=422, detail="Choose at least one build")
    seen: dict[str, str] = {}
    for target, version in items:
        if target not in TARGETS:
            raise HTTPException(status_code=422, detail="Unknown build target")
        if version and not SEMVER.match(version):
            raise HTTPException(status_code=422, detail="Version must look like 1.2.3")
        app = _app(target)
        if app in seen:
            raise HTTPException(
                status_code=422,
                detail=f"Choose either the {app} Android app or its web update, not both. "
                "A new Android app already includes the latest screens.",
            )
        seen[app] = target
    repo, _, branch = _config()
    plans: list[dict[str, Any]] = []
    for target, requested in items:
        prefix, _path, label = TARGETS[target]
        planned = await planner.plan(_app(target))
        kind = _kind(target)
        version = planned["next_apk"] if kind == "apk" else planned["next_web"]
        if not version:
            raise HTTPException(
                status_code=409,
                detail=f"{label}: the web counter is full. Build a new Android app to restart it.",
            )
        try:
            if requested:
                rules.check_build_version(kind, str(version), requested)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=f"{label}: {exc}") from exc
        plans.append(
            {
                "target": target,
                "version": str(version),
                "tag": f"{prefix}{version}",
                "label": label,
                "stale": await _tag_exists(repo, f"{prefix}{version}"),
            }
        )
    results: list[dict[str, Any]] = []
    for plan in plans:
        try:
            if plan["stale"]:
                await _clear_failed_tag(repo, plan["tag"])
            head = await _request("GET", f"/repos/{repo}/git/ref/heads/{branch}")
            if head.status_code != 200:
                raise _fail(head, f"reading branch {branch}")
            sha = head.json()["object"]["sha"]
            created = await _request(
                "POST",
                f"/repos/{repo}/git/refs",
                json={"ref": f"refs/tags/{plan['tag']}", "sha": sha},
            )
            if created.status_code == 422:
                raise HTTPException(status_code=409, detail=f"Tag {plan['tag']} already exists.")
            if created.status_code != 201:
                raise _fail(created, "creating the tag")
            results.append(
                {
                    "target": plan["target"],
                    "tag": plan["tag"],
                    "sha": sha,
                    "version": plan["version"],
                    "ok": True,
                    "error": None,
                }
            )
        except HTTPException as exc:
            results.append(
                {
                    "target": plan["target"],
                    "tag": plan["tag"],
                    "sha": None,
                    "version": plan["version"],
                    "ok": False,
                    "error": exc.detail,
                }
            )
    return results


async def start_build(target: str, version: str) -> dict[str, Any]:
    """Single-build convenience used by older callers."""
    (result,) = await start_builds([(target, version)])
    if not result["ok"]:
        raise HTTPException(status_code=502, detail=result["error"])
    return {"tag": result["tag"], "sha": result["sha"], "target": target}
