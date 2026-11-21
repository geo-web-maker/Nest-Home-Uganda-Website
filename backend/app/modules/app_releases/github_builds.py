"""Start and watch release builds on GitHub from the admin app.

A build starts by creating the release tag on the default branch; the tag workflows then
build, sign, upload and publish. Nothing here can touch code, secrets or other workflows.
"""

import base64
import json
import re
from typing import Any

import httpx
from fastapi import HTTPException

from app.core.config import get_settings
from app.modules.app_releases import rules

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


def summarise_run(run: dict[str, Any]) -> dict[str, Any] | None:
    tag = run.get("head_branch") or ""
    if run.get("event") != "push" or not TAG_RE.match(tag):
        return None
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


APPS = {"nurse": "nurse/package.json", "admin": "admin/package.json"}
_VERSION_FIELD = re.compile(r'("version"\s*:\s*")[^"]+(")')


def _kind(target: str) -> str:
    return "web" if target.endswith("-web") else "apk"


def _app(target: str) -> str:
    return target.split("-", 1)[0]


async def _read_package(repo: str, branch: str, path: str) -> tuple[str, str, str]:
    """Return (version, file sha, raw text) of a package.json on the branch."""
    response = await _request("GET", f"/repos/{repo}/contents/{path}", params={"ref": branch})
    if response.status_code != 200:
        raise _fail(response, f"reading {path}")
    try:
        data = response.json()
        text = base64.b64decode(data["content"]).decode()
        return str(json.loads(text)["version"]), str(data.get("sha", "")), text
    except (KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=502, detail=f"Could not read the version in {path}."
        ) from exc


async def build_versions() -> dict[str, Any]:
    """Current version per app and the next version each kind of build may use."""
    repo, _, branch = _config()
    apps: dict[str, Any] = {}
    for app, path in APPS.items():
        current = (await _read_package(repo, branch, path))[0]
        try:
            apps[app] = {"current": current, "next": rules.suggest_versions(current)}
        except ValueError:
            apps[app] = {"current": current, "next": None}
    return {"apps": apps}


async def _tag_exists(repo: str, tag: str) -> bool:
    existing = await _request("GET", f"/repos/{repo}/git/ref/tags/{tag}")
    if existing.status_code == 200:
        return True
    if existing.status_code != 404:
        raise _fail(existing, "checking the tag")
    return False


async def _commit_version(
    repo: str, branch: str, path: str, file_sha: str, text: str, version: str, label: str
) -> str:
    """Write the new version into package.json on the branch; return the commit sha."""
    updated, count = _VERSION_FIELD.subn(rf"\g<1>{version}\g<2>", text, count=1)
    if count != 1:
        raise HTTPException(status_code=502, detail=f"Could not find the version in {path}.")
    response = await _request(
        "PUT",
        f"/repos/{repo}/contents/{path}",
        json={
            "message": f"Release {label} {version}",
            "content": base64.b64encode(updated.encode()).decode(),
            "sha": file_sha,
            "branch": branch,
        },
    )
    if response.status_code == 409:
        raise HTTPException(
            status_code=409, detail=f"{path} changed on GitHub while starting. Try again."
        )
    if response.status_code not in (200, 201):
        raise _fail(response, f"updating the version in {path}")
    return str(response.json()["commit"]["sha"])


async def start_builds(items: list[tuple[str, str]]) -> list[dict[str, Any]]:
    """Start several builds at once.

    Everything is checked first and nothing is written if any item is invalid. Each app's
    package.json is then committed once, and every tag points at that commit. A failure while
    writing is reported on its item and does not stop the others.
    """
    if not items:
        raise HTTPException(status_code=422, detail="Choose at least one build")
    seen: dict[str, str] = {}
    for target, version in items:
        if target not in TARGETS:
            raise HTTPException(status_code=422, detail="Unknown build target")
        if not SEMVER.match(version):
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
    for target, version in items:
        prefix, path, label = TARGETS[target]
        current, file_sha, text = await _read_package(repo, branch, path)
        try:
            rules.check_build_version(_kind(target), current, version)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=f"{label}: {exc}") from exc
        tag = f"{prefix}{version}"
        if await _tag_exists(repo, tag):
            raise HTTPException(
                status_code=409, detail=f"Tag {tag} already exists. Raise the version to build again."
            )
        plans.append(
            {"target": target, "version": version, "tag": tag, "path": path, "label": label,
             "current": current, "file_sha": file_sha, "text": text}
        )
    results: list[dict[str, Any]] = []
    for plan in plans:
        try:
            if plan["version"] != plan["current"]:
                sha = await _commit_version(
                    repo, branch, plan["path"], plan["file_sha"], plan["text"],
                    plan["version"], plan["label"],
                )
            else:
                head = await _request("GET", f"/repos/{repo}/git/ref/heads/{branch}")
                if head.status_code != 200:
                    raise _fail(head, f"reading branch {branch}")
                sha = head.json()["object"]["sha"]
            created = await _request(
                "POST", f"/repos/{repo}/git/refs", json={"ref": f"refs/tags/{plan['tag']}", "sha": sha}
            )
            if created.status_code == 422:
                raise HTTPException(status_code=409, detail=f"Tag {plan['tag']} already exists.")
            if created.status_code != 201:
                raise _fail(created, "creating the tag")
            results.append({"target": plan["target"], "tag": plan["tag"], "sha": sha,
                            "version": plan["version"], "ok": True, "error": None})
        except HTTPException as exc:
            results.append({"target": plan["target"], "tag": plan["tag"], "sha": None,
                            "version": plan["version"], "ok": False, "error": exc.detail})
    return results


async def start_build(target: str, version: str) -> dict[str, Any]:
    """Single-build convenience used by older callers."""
    (result,) = await start_builds([(target, version)])
    if not result["ok"]:
        raise HTTPException(status_code=502, detail=result["error"])
    return {"tag": result["tag"], "sha": result["sha"], "target": target}
