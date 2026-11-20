"""Owner-only app release administration. Clients read the compact policy via /field/app/version."""

from datetime import UTC, datetime
from functools import cmp_to_key
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from app.core.config import get_settings
from app.core.deps import Principal, require_scopes
from app.core.rate_limit import rate_limit
from app.core.security import constant_time_equal
from app.core.storage import Bucket, get_storage
from app.modules.app_releases.models import AppRelease
from app.modules.app_releases.rules import compare_versions
from app.modules.app_releases.schemas import AppReleaseCreate
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


MIN_RELEASE_KEY_LENGTH = 32


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
    if len(configured) < MIN_RELEASE_KEY_LENGTH:
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
    """Newest active APK for an app when it is newer than the installed versionName, else {"update": false}."""
    rows = [
        row
        for row in await AppRelease.find().to_list()
        if row.platform == "android" and row.active and row.apk_key and row.app == app
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
        latest.apk_key,
        expires_seconds=600,
        download_filename=f"{app}-{latest.version}.apk",
        content_type="application/vnd.android.package-archive",
    )
    return {
        "update": True,
        "version": latest.version,
        "version_code": latest.version_code,
        "url": url,
        "sha256": latest.sha256,
        "size_bytes": latest.size_bytes,
        "release_notes": latest.release_notes,
    }
