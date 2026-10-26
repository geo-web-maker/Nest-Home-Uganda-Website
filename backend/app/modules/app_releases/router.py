"""Owner-only app release administration. Clients read the compact policy via /field/app/version."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import Principal, require_scopes
from app.modules.app_releases.models import AppRelease
from app.modules.app_releases.rules import compare_versions
from app.modules.app_releases.schemas import AppReleaseCreate
from app.modules.audit import service as audit

router = APIRouter(prefix="/admin/app-releases", tags=["app-releases"])


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


@router.post("", status_code=201)
async def publish_release(
    body: AppReleaseCreate, principal: Principal = Depends(require_scopes("system:manage"))
):
    _superadmin(principal)
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
        **body.model_dump(), created_by=principal.user_id, published_at=datetime.now(UTC)
    )
    await row.insert()
    await audit.record(
        principal,
        "app_release.publish",
        "app_release",
        row.id,
        after={
            "platform": row.platform,
            "version": row.version,
            "min_supported_version": row.min_supported_version,
            "active": row.active,
        },
    )
    return row.model_dump(mode="json", exclude={"_id"})
