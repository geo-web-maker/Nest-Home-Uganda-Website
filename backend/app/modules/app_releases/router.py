"""Owner-only app release administration. Clients read the compact policy via /field/app/version."""

from datetime import UTC, datetime
from functools import cmp_to_key
from typing import Literal

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Query, Response
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.deps import Principal, require_scopes
from app.core.rate_limit import rate_limit
from app.core.security import constant_time_equal
from app.core.storage import Bucket, get_storage
from app.core.totp_guard import assert_totp_session
from app.modules.app_releases import github_builds, preflight
from app.modules.app_releases.models import AppRelease
from app.modules.app_releases.rules import compare_versions
from app.modules.app_releases.schemas import AppReleaseCreate, BuildBatch
from app.modules.audit import service as audit

router = APIRouter(prefix="/admin/app-releases", tags=["app-releases"])
# Unauthenticated on purpose: a web bundle is the same public JavaScript the sites already serve, and
# the check must work on the login screen. Downloads use short-lived signed URLs.
public_router = APIRouter(prefix="/app-bundles", tags=["app-releases"])


def _superadmin(principal: Principal) -> Principal:
    if not principal.is_superadmin:
        raise HTTPException(status_code=403, detail="Super administrator access required")
    return principal


@router.get("")
async def list_releases(
    platform: str | None = Query(default=None, pattern="^(android|ios|web)$"),
    principal: Principal = Depends(require_scopes("system:manage")),
):
    _superadmin(principal)
    rows = await AppRelease.find().to_list()
    if platform:
        rows = [row for row in rows if row.platform == platform]
    rows.sort(key=lambda row: (row.platform, row.published_at), reverse=True)
    return {"items": [row.model_dump(mode="json", exclude={"_id"}) for row in rows]}


class BuildStart(BaseModel):
    target: Literal["nurse-apk", "admin-apk", "nurse-web", "admin-web"]
    version: str


@router.get("/builds/versions")
async def build_versions(principal: Principal = Depends(require_scopes("system:manage"))):
    _superadmin(principal)
    return await github_builds.build_versions()


@router.post(
    "/builds/batch",
    status_code=201,
    dependencies=[Depends(rate_limit("app_build_start", 10, 3600))],
)
async def start_builds(
    body: BuildBatch, principal: Principal = Depends(require_scopes("system:manage"))
):
    _superadmin(principal)
    results = await github_builds.start_builds([(i.target, i.version.strip()) for i in body.items])
    for item in results:
        if item["ok"]:
            await audit.record(
                principal, "app_build.start", "app_build", item["tag"],
                after={"target": item["target"], "version": item["version"], "sha": item["sha"]},
            )
    return {"items": results}


@router.get("/builds")
async def list_builds(principal: Principal = Depends(require_scopes("system:manage"))):
    _superadmin(principal)
    return await github_builds.list_builds()


@router.post(
    "/builds", status_code=201, dependencies=[Depends(rate_limit("app_build_start", 10, 3600))]
)
async def start_build(
    body: BuildStart, principal: Principal = Depends(require_scopes("system:manage"))
):
    _superadmin(principal)
    result = await github_builds.start_build(body.target, body.version.strip())
    await audit.record(
        principal,
        "app_build.start",
        "app_build",
        result["tag"],
        after={"target": body.target, "version": body.version.strip(), "sha": result["sha"]},
    )
    return result


@router.post("/preflight")
async def release_preflight(
    response: Response,
    principal: Principal = Depends(require_scopes("system:manage")),
    mail_totp: str | None = Cookie(default=None),
):
    """Check what a release needs before a build (superadmin with a verified authenticator)."""
    _superadmin(principal)
    await assert_totp_session(principal, mail_totp)
    checks = await preflight.run_preflight()
    response.headers["Cache-Control"] = "no-store"
    return {"checks": checks, "summary": preflight.summarize(checks)}


async def _create_release(body: AppReleaseCreate, principal: Principal | None) -> dict:
    """Validate and store a release. principal is None when CI publishes with the release key."""
    try:
        if compare_versions(body.min_supported_version, body.version) > 0:
            raise HTTPException(
                status_code=422, detail="Minimum supported version cannot exceed latest version"
            )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    existing = await AppRelease.find_one(AppRelease.id == body.id)
    if existing:
        raise HTTPException(status_code=409, detail="Release identifier already exists")
    row = AppRelease(
        **body.model_dump(),
        created_by=principal.user_id if principal else "release-key",
        published_at=datetime.now(UTC),
    )
    await row.insert()
    await audit.record(
        principal,
        "app_release.publish",
        "app_release",
        row.id,
        item_label="release key (CI)" if principal is None else None,
        after={
            "platform": row.platform,
            "version": row.version,
            "min_supported_version": row.min_supported_version,
            "active": row.active,
        },
    )
    return row.model_dump(mode="json", exclude={"_id"})


@router.post("", status_code=201)
async def publish_release(
    body: AppReleaseCreate, principal: Principal = Depends(require_scopes("system:manage"))
):
    _superadmin(principal)
    return await _create_release(body, principal)


@public_router.post(
    "/releases",
    status_code=201,
    dependencies=[Depends(rate_limit("app_release_key", 10, 60))],
)
async def publish_release_with_key(
    body: AppReleaseCreate,
    x_release_key: str | None = Header(default=None, alias="X-Release-Key"),
):
    """CI publishes a release with a long-lived key that can do nothing else.

    Disabled (404) unless NEST_RELEASE_PUBLISH_KEY is set to a value of at least 32 characters.
    """
    configured = get_settings().release_publish_key
    if len(configured) < preflight.MIN_RELEASE_KEY_LENGTH:
        raise HTTPException(status_code=404, detail="Not found")
    if not x_release_key or not constant_time_equal(x_release_key, configured):
        raise HTTPException(status_code=401, detail="Invalid release key")
    return await _create_release(body, None)


@public_router.get("/{app}/latest", dependencies=[Depends(rate_limit("app_bundle", 30, 60))])
async def latest_web_bundle(
    app: Literal["nurse", "admin"],
    native_code: int = Query(ge=1),
    current: str = Query(max_length=80),
):
    """Newest active web bundle this installed APK can run, or {"update": false}."""
    rows = [
        row
        for row in await AppRelease.find().to_list()
        if row.platform == "web"
        and row.active
        and row.bundle_key
        and row.app == app
        and (row.min_native_version_code or 1) <= native_code
    ]
    if not rows:
        return {"update": False}
    rows.sort(key=cmp_to_key(lambda a, b: compare_versions(a.version, b.version)), reverse=True)
    latest = rows[0]
    try:
        newer = compare_versions(latest.version, current) > 0
    except ValueError:
        newer = True
    if not newer:
        return {"update": False}
    url = await get_storage().signed_url(
        Bucket.PRIVATE,
        latest.bundle_key,
        expires_seconds=600,
        download_filename=f"{app}-web-{latest.version}.zip",
        content_type="application/zip",
    )
    return {
        "update": True,
        "version": latest.version,
        "url": url,
        "sha256": latest.sha256,
        "size_bytes": latest.size_bytes,
        "release_notes": latest.release_notes,
    }


@public_router.get("/{app}/apk", dependencies=[Depends(rate_limit("app_apk", 30, 60))])
async def latest_apk(app: Literal["nurse", "admin"], current: str = Query(max_length=80)):
    """Newest active APK for an app when it is newer than the installed versionName, else {"update": false}.

    Also returns ``blocked`` (the installed version is below the minimum supported) and
    ``min_supported`` so callers can gate the login screen before the user authenticates.
    """
    from app.modules.app_releases.rules import effective_minimum_version

    all_rows = [
        row
        for row in await AppRelease.find().to_list()
        if row.platform == "android" and row.active and row.app == app
    ]
    apk_rows = [row for row in all_rows if row.apk_key]

    # Minimum floor from the care settings (best-effort; fall back gracefully).
    config_minimum = "0.1.0"
    try:
        from app.modules.field.router import care_values as _care_values
        values = await _care_values()
        config_minimum = str(values.get("care.min_app_version", "0.1.0"))
    except Exception:
        pass

    if not apk_rows:
        # No APK on record. Still compute blocked from any release row so the
        # pre-login check can gate the login screen even before an APK is uploaded.
        blocked = False
        minimum = config_minimum
        if all_rows:
            all_rows.sort(key=cmp_to_key(lambda a, b: compare_versions(a.version, b.version)), reverse=True)
            minimum = effective_minimum_version(all_rows[0].min_supported_version, config_minimum)
            try:
                blocked = compare_versions(current, minimum) < 0
            except ValueError:
                pass
        return {"update": False, "has_releases": bool(all_rows), "blocked": blocked, "min_supported": minimum}

    apk_rows.sort(key=cmp_to_key(lambda a, b: compare_versions(a.version, b.version)), reverse=True)
    latest = apk_rows[0]
    minimum = effective_minimum_version(latest.min_supported_version, config_minimum)
    try:
        newer = compare_versions(latest.version, current) > 0
        blocked = compare_versions(current, minimum) < 0
    except ValueError:
        newer = True
        blocked = False
    if not newer:
        return {"update": False, "has_releases": True, "blocked": blocked, "min_supported": minimum}
    url = await get_storage().signed_url(
        Bucket.PRIVATE,
        latest.apk_key,
        expires_seconds=600,
        download_filename=f"{app}-{latest.version}.apk",
        content_type="application/vnd.android.package-archive",
    )
    return {
        "update": True,
        "has_releases": True,
        "blocked": blocked,
        "min_supported": minimum,
        "version": latest.version,
        "version_code": latest.version_code,
        "url": url,
        "sha256": latest.sha256,
        "size_bytes": latest.size_bytes,
        "release_notes": latest.release_notes,
    }


@public_router.get(
    "/{app}/version",
    dependencies=[Depends(rate_limit("app_version_public", 60, 60))],
)
async def latest_version_public(
    app: Literal["nurse", "admin"],
    current: str = Query(max_length=80),
    platform: str = Query(default="android", pattern="^(android|ios|web)$"),
):
    """Unauthenticated version-policy summary for pre-login update checks.

    Returns the minimum supported version, whether the caller is blocked, and whether
    any release records exist. Download URLs are not included; use /apk or /latest for those.
    Safe to call before the user authenticates — rate-limited, no credentials required.
    """
    from app.modules.app_releases.rules import effective_minimum_version

    rows = [
        row
        for row in await AppRelease.find().to_list()
        if row.platform == platform and row.active and not row.bundle_key and row.app == app
    ]
    config_minimum = "0.1.0"
    try:
        from app.modules.field.router import care_values as _care_values
        values = await _care_values()
        config_minimum = str(values.get("care.min_app_version", "0.1.0"))
    except Exception:
        pass

    if not rows:
        return {
            "has_releases": False,
            "latest": None,
            "min_supported": config_minimum,
            "blocked": False,
            "platform": platform,
        }

    rows.sort(key=cmp_to_key(lambda a, b: compare_versions(a.version, b.version)), reverse=True)
    latest = rows[0]
    minimum = effective_minimum_version(latest.min_supported_version, config_minimum)
    try:
        blocked = compare_versions(current, minimum) < 0
    except ValueError:
        blocked = False
    return {
        "has_releases": True,
        "latest": latest.version,
        "min_supported": minimum,
        "blocked": blocked,
        "platform": platform,
    }

        "release_notes": latest.release_notes,
    }
