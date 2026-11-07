"""Settings reads/writes and the cacheable public site-settings aggregate."""

import hashlib
import json
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, Response

from app.core.deps import Principal, require_scopes
from app.core.i18n import language
from app.core.rate_limit import client_ip
from app.core.security import hash_ip
from app.modules.settings import service
from app.modules.settings.schemas import PublicSiteSettings, SettingEntry

public_router = APIRouter(prefix="/public/site", tags=["public-site-settings"])
admin_router = APIRouter(prefix="/admin/settings", tags=["admin-settings"])
CanRead = Annotated[Principal, Depends(require_scopes("settings:read"))]
CanWrite = Annotated[Principal, Depends(require_scopes("settings:write"))]
CanManageSystem = Annotated[Principal, Depends(require_scopes("system:manage"))]


@public_router.get("", response_model=PublicSiteSettings)
async def public_site(
    response: Response,
    lang: Annotated[str, Depends(language)],
    if_none_match: Annotated[str | None, Header(alias="If-None-Match")] = None,
) -> PublicSiteSettings | Response:
    data = await service.public_site(lang)
    content = json.dumps(data.model_dump(mode="json"), ensure_ascii=False, separators=(",", ":"))
    etag = '"' + hashlib.sha256(content.encode("utf-8")).hexdigest() + '"'
    response.headers["Cache-Control"] = "public, max-age=60"
    response.headers["ETag"] = etag
    if if_none_match == etag:
        return Response(
            status_code=304,
            headers={"Cache-Control": "public, max-age=60", "ETag": etag},
        )
    return data


@admin_router.get("", response_model=list[SettingEntry])
async def admin_list(principal: CanRead) -> list[SettingEntry]:
    return await service.admin_entries(principal)


@admin_router.get("/sms", response_model=list[SettingEntry])
async def admin_sms_list(principal: CanManageSystem) -> list[SettingEntry]:
    return await service.admin_entries(principal, group="sms")


@admin_router.get("/system", response_model=list[SettingEntry])
async def admin_system_list(principal: CanManageSystem) -> list[SettingEntry]:
    return await service.admin_entries(principal, group="system")


@admin_router.patch("/sms", response_model=list[SettingEntry])
async def admin_sms_patch(
    changes: dict,
    principal: CanManageSystem,
    request: Request,
) -> list[SettingEntry]:
    return await service.patch_group(principal, "sms", changes, hash_ip(client_ip(request)))


@admin_router.patch("/{tab}", response_model=list[SettingEntry])
async def admin_patch(
    tab: str,
    changes: dict,
    principal: CanWrite,
    request: Request,
) -> list[SettingEntry]:
    return await service.patch_group(principal, tab, changes, hash_ip(client_ip(request)))


@admin_router.post("/theme/reset", response_model=list[SettingEntry])
async def admin_reset_theme(principal: CanWrite, request: Request) -> list[SettingEntry]:
    return await service.reset_theme(principal, hash_ip(client_ip(request)))
