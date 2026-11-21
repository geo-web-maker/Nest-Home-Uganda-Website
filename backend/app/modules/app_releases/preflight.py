# ruff: noqa: E501  (long lines are user-facing sentences)
"""Release preflight: check, before a build, that everything a release needs is in place.

Runs from Diagnostics. It reads GitHub (never secret values) and does two harmless write tests, each
removed straight away: a tiny file in the private bucket and a throwaway tag. It reports problems in
plain words so they can be fixed before a 15 minute build fails.
"""

import ipaddress
import secrets
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

from app.core.config import get_settings
from app.core.storage import Bucket, get_storage
from app.modules.app_releases import github_builds as gb
from app.modules.app_releases import planner

MIN_RELEASE_KEY_LENGTH = 32
PASS, WARN, FAIL, SKIP = "pass", "warn", "fail", "skip"
WORKFLOWS = ("android-release.yml", "admin-android-release.yml", "web-bundle-release.yml")
REQUIRED_SECRETS = (
    "NURSE_KEYSTORE_BASE64",
    "NURSE_KEYSTORE_PASSWORD",
    "NURSE_KEY_ALIAS",
    "NURSE_KEY_PASSWORD",
    "ADMIN_KEYSTORE_BASE64",
    "ADMIN_KEYSTORE_PASSWORD",
    "ADMIN_KEY_ALIAS",
    "ADMIN_KEY_PASSWORD",
    "S3_KEY",
    "S3_SECRET",
    "S3_REGION",
    "S3_ENDPOINT",
    "S3_BUCKET_PRIVATE",
    "ADMIN_API_URL",
    "RELEASE_PUBLISH_KEY",
)


def _c(check_id: str, status: str, detail: str) -> dict[str, str]:
    return {"id": check_id, "status": status, "detail": detail}


def summarize(checks: list[dict[str, str]]) -> dict[str, int]:
    return {state: sum(c["status"] == state for c in checks) for state in (PASS, WARN, FAIL, SKIP)}


def _safe_https_host(url: str) -> bool:
    parts = urlparse(url)
    host = parts.hostname or ""
    if parts.scheme != "https" or not host or host == "localhost":
        return False
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return True
    return False  # a bare IP address is never a real release host


def check_release_key() -> dict[str, str]:
    key = get_settings().release_publish_key
    if not key:
        return _c(
            "release_key_on_backend",
            FAIL,
            "NEST_RELEASE_PUBLISH_KEY is not set on the backend, so CI cannot publish a release.",
        )
    if len(key) < MIN_RELEASE_KEY_LENGTH:
        return _c(
            "release_key_on_backend",
            FAIL,
            f"NEST_RELEASE_PUBLISH_KEY is shorter than {MIN_RELEASE_KEY_LENGTH} characters, so the route stays off.",
        )
    return _c(
        "release_key_on_backend",
        PASS,
        "Set and long enough. GitHub's copy (RELEASE_PUBLISH_KEY) must be identical; "
        "that cannot be compared from here.",
    )


async def check_bucket() -> dict[str, str]:
    key = f"apks/.preflight-{secrets.token_hex(6)}.txt"
    storage = get_storage()
    try:
        await storage.put(Bucket.PRIVATE, key, b"preflight", "text/plain")
        data = await storage.get(Bucket.PRIVATE, key)
        await storage.delete(Bucket.PRIVATE, key)
    except Exception as exc:  # noqa: BLE001 - report the kind, never the message (may hold keys)
        return _c(
            "private_bucket_write",
            FAIL,
            f"The backend could not write to its private bucket ({type(exc).__name__}). "
            "Check S3_ENDPOINT, S3_BUCKET_PRIVATE and that the key has Object Read and Write.",
        )
    if data != b"preflight":
        return _c(
            "private_bucket_write",
            FAIL,
            "The test file read back differently from what was written.",
        )
    return _c(
        "private_bucket_write",
        PASS,
        "Wrote, read back and deleted a test file. GitHub must use the same bucket and a key that can "
        "write to it; see the GitHub secrets check below.",
    )


async def _gh(method: str, path: str, **kwargs: Any) -> httpx.Response | None:
    try:
        return await gb._request(method, path, **kwargs)
    except HTTPException:
        return None


def _denied(response: httpx.Response | None) -> bool:
    return response is not None and response.status_code in (401, 403, 404)


async def check_github() -> list[dict[str, str]]:
    s = get_settings()
    if not s.github_repo or not s.github_token or "/" not in s.github_repo:
        out = [
            _c(
                "github_connection",
                FAIL,
                "NEST_GITHUB_REPO and NEST_GITHUB_TOKEN are not both set on the backend.",
            )
        ]
        out += [
            _c(name, SKIP, "Skipped until GitHub is connected.")
            for name in (
                "github_branch",
                "github_tag_permission",
                "github_workflows",
                "nurse_version",
                "admin_version",
                "github_secrets",
                "github_variables",
            )
        ]
        return out
    repo, branch = s.github_repo, s.github_branch or "main"
    out: list[dict[str, str]] = []

    response = await _gh("GET", f"/repos/{repo}")
    if response is None:
        return [_c("github_connection", FAIL, "GitHub could not be reached from the backend.")]
    if response.status_code != 200:
        return [
            _c(
                "github_connection",
                FAIL,
                f"GitHub answered {response.status_code} for {repo}. Check the repo name and that the "
                "token is valid, unexpired and limited to this repository.",
            )
        ]
    out.append(_c("github_connection", PASS, f"Connected to {repo}."))

    head = await _gh("GET", f"/repos/{repo}/git/ref/heads/{branch}")
    if head is None or head.status_code != 200:
        out.append(
            _c("github_branch", FAIL, f"Branch {branch} was not found. Set NEST_GITHUB_BRANCH.")
        )
        sha = ""
    else:
        sha = head.json()["object"]["sha"]
        out.append(_c("github_branch", PASS, f"Branch {branch} found."))

    runs = await _gh("GET", f"/repos/{repo}/actions/runs", params={"per_page": 1})
    if runs is None or runs.status_code != 200:
        out.append(
            _c(
                "github_actions_read",
                FAIL,
                "The token cannot read Actions runs. Add Actions: Read.",
            )
        )
    else:
        out.append(_c("github_actions_read", PASS, "The token can read build runs."))

    if sha:
        name = f"preflight-{secrets.token_hex(6)}"
        made = await _gh(
            "POST", f"/repos/{repo}/git/refs", json={"ref": f"refs/tags/{name}", "sha": sha}
        )
        if made is None or made.status_code != 201:
            out.append(
                _c(
                    "github_tag_permission",
                    FAIL,
                    "The token cannot create tags. Give it Contents: Read and write, or Start build will fail.",
                )
            )
        else:
            gone = await _gh("DELETE", f"/repos/{repo}/git/refs/tags/{name}")
            if gone is None or gone.status_code != 204:
                out.append(
                    _c(
                        "github_tag_permission",
                        WARN,
                        f"Tags can be created, but test tag {name} was not removed. "
                        "Delete it on GitHub.",
                    )
                )
            else:
                out.append(
                    _c("github_tag_permission", PASS, "Created and removed a throwaway tag.")
                )
    else:
        out.append(_c("github_tag_permission", SKIP, "Needs the branch to be found first."))

    files = await _gh("GET", f"/repos/{repo}/contents/.github/workflows", params={"ref": branch})
    if files is None or files.status_code != 200:
        out.append(_c("github_workflows", FAIL, f"Could not list .github/workflows on {branch}."))
    else:
        present = {f.get("name") for f in files.json()}
        missing = [w for w in WORKFLOWS if w not in present]
        out.append(
            _c(
                "github_workflows",
                FAIL,
                f"Missing on {branch}: {', '.join(missing)}. Push the project.",
            )
            if missing
            else _c("github_workflows", PASS, "All three release workflows are on the branch.")
        )

    for app, prefix in (("nurse", "nurse"), ("admin", "admin")):
        try:
            planned = await planner.plan(app)
        except Exception:
            out.append(
                _c(
                    f"{app}_version",
                    FAIL,
                    f"Could not read the {app} releases to work out the next version.",
                )
            )
            continue
        apk, web = planned["next_apk"], planned["next_web"]
        if not web:
            out.append(
                _c(
                    f"{app}_version",
                    WARN,
                    f"The {app} web counter is full. Build a new Android app ({apk}) to start it again.",
                )
            )
            continue
        # A tag that exists without a release is a failed build; starting it again removes the tag.
        stale = []
        for tag in (f"{prefix}-v{apk}", f"{prefix}-web-v{web}"):
            ref = await _gh("GET", f"/repos/{repo}/git/ref/tags/{tag}")
            if ref is not None and ref.status_code == 200:
                stale.append(tag)
        if stale:
            out.append(
                _c(
                    f"{app}_version",
                    WARN,
                    f"Next numbers are Android app {apk} and web update {web}. {' and '.join(stale)} "
                    "exists from a build that did not publish; starting that build again replaces it.",
                )
            )
        else:
            out.append(
                _c(f"{app}_version", PASS, f"Next numbers: Android app {apk}, web update {web}.")
            )

    out.append(await _check_secrets(repo))
    out.append(await _check_variables(repo))
    return out


async def _check_secrets(repo: str) -> dict[str, str]:
    response = await _gh("GET", f"/repos/{repo}/actions/secrets", params={"per_page": 100})
    if _denied(response) or response is None:
        return _c(
            "github_secrets",
            SKIP,
            "The token cannot list secret names. Add the read-only Secrets permission to check them; "
            "values are never readable.",
        )
    names = {s["name"] for s in response.json().get("secrets", [])}
    missing = [n for n in REQUIRED_SECRETS if n not in names]
    if missing:
        return _c("github_secrets", FAIL, f"Missing GitHub secrets: {', '.join(missing)}.")
    return _c(
        "github_secrets",
        PASS,
        "All required secret names exist. Their values cannot be checked, so a typo shows up only in the build.",
    )


async def _check_variables(repo: str) -> dict[str, str]:
    response = await _gh("GET", f"/repos/{repo}/actions/variables", params={"per_page": 100})
    if _denied(response) or response is None:
        return _c(
            "github_variables",
            SKIP,
            "The token cannot read variables. Add the read-only Variables permission to check them.",
        )
    values = {v["name"]: v.get("value", "") for v in response.json().get("variables", [])}
    problems: list[str] = []
    notes: list[str] = []
    api = values.get("VITE_API_URL", "")
    if not api:
        problems.append("VITE_API_URL is missing (an app built without it cannot log in)")
    elif (
        not api.startswith("https://")
        or api.endswith("/")
        or api.rstrip("/").endswith(("/api", "/api/v1"))
    ):
        problems.append(
            "VITE_API_URL must be https, with no trailing slash and no /api/v1 on the end"
        )
    elif not _safe_https_host(api):
        problems.append("VITE_API_URL must be an https address with a domain name")
    else:
        try:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=False) as client:
                reach = await client.get(f"{api}/api/v1/app-bundles/nurse/latest")
            if reach.status_code >= 500:
                problems.append(f"VITE_API_URL answered {reach.status_code}")
            else:
                notes.append(f"VITE_API_URL reachable ({reach.status_code})")
        except httpx.HTTPError:
            problems.append(
                "VITE_API_URL could not be reached (a sleeping host can take a minute; retry)"
            )
    mail = values.get("VITE_MAIL_STORAGE_URL", "")
    if not mail:
        problems.append("VITE_MAIL_STORAGE_URL is missing (mail attachments will not upload)")
    else:
        parts = urlparse(mail)
        if parts.scheme != "https" or not parts.hostname or parts.path not in ("",):
            problems.append(
                "VITE_MAIL_STORAGE_URL must be the https origin only: no bucket, no trailing slash"
            )
        else:
            notes.append("VITE_MAIL_STORAGE_URL looks right")
    if problems:
        return _c("github_variables", FAIL, "; ".join(problems) + ".")
    return _c("github_variables", PASS, "; ".join(notes) + ".")


async def run_preflight() -> list[dict[str, str]]:
    checks = [check_release_key(), await check_bucket()]
    checks += await check_github()
    return checks
