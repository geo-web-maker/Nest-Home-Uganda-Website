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


async def _package_version(repo: str, branch: str, path: str) -> str:
    response = await _request("GET", f"/repos/{repo}/contents/{path}", params={"ref": branch})
    if response.status_code != 200:
        raise _fail(response, f"reading {path}")
    try:
        content = base64.b64decode(response.json()["content"]).decode()
        return str(json.loads(content)["version"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=502, detail=f"Could not read the version in {path}."
        ) from exc


async def start_build(target: str, version: str) -> dict[str, Any]:
    if target not in TARGETS:
        raise HTTPException(status_code=422, detail="Unknown build target")
    if not SEMVER.match(version):
        raise HTTPException(status_code=422, detail="Version must look like 1.2.3")
    repo, _, branch = _config()
    prefix, package_path, _label = TARGETS[target]
    current = await _package_version(repo, branch, package_path)
    if current != version:
        raise HTTPException(
            status_code=409,
            detail=f"{package_path} on {branch} says {current}, not {version}. "
            "Change the version in package.json on GitHub and commit it, then start the build.",
        )
    tag = f"{prefix}{version}"
    existing = await _request("GET", f"/repos/{repo}/git/ref/tags/{tag}")
    if existing.status_code == 200:
        raise HTTPException(
            status_code=409, detail=f"Tag {tag} already exists. Raise the version to build again."
        )
    if existing.status_code != 404:
        raise _fail(existing, "checking the tag")
    head = await _request("GET", f"/repos/{repo}/git/ref/heads/{branch}")
    if head.status_code != 200:
        raise _fail(head, f"reading branch {branch}")
    sha = head.json()["object"]["sha"]
    created = await _request(
        "POST", f"/repos/{repo}/git/refs", json={"ref": f"refs/tags/{tag}", "sha": sha}
    )
    if created.status_code == 422:
        raise HTTPException(status_code=409, detail=f"Tag {tag} already exists.")
    if created.status_code != 201:
        raise _fail(created, "creating the tag")
    return {"tag": tag, "sha": sha, "target": target}
