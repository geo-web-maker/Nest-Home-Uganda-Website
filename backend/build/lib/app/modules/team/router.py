"""Public team reads and scope-protected admin content endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response

from app.core.deps import Principal, require_scopes
from app.core.i18n import language
from app.core.pagination import Page, PageParams, page_params
from app.core.rate_limit import client_ip
from app.core.security import hash_ip
from app.modules.team import service
from app.modules.team.schemas import (
    TeamMemberAdminOut,
    TeamMemberIn,
    TeamMemberPublic,
    TeamMemberUpdate,
)

public_router = APIRouter(prefix="/public/team", tags=["public-team"])
admin_router = APIRouter(prefix="/admin/team", tags=["admin-team"])

CACHE_PUBLIC = "public, max-age=60"

CanRead = Annotated[Principal, Depends(require_scopes("content:read"))]
CanWrite = Annotated[Principal, Depends(require_scopes("content:write"))]


@public_router.get("", response_model=list[TeamMemberPublic])
async def public_list(
    response: Response,
    lang: Annotated[str, Depends(language)],
) -> list[TeamMemberPublic]:
    response.headers["Cache-Control"] = CACHE_PUBLIC
    return await service.public_list(lang)


@admin_router.get("", response_model=Page[TeamMemberAdminOut])
async def admin_list(
    _: CanRead,
    page: Annotated[PageParams, Depends(page_params)],
    q: Annotated[str | None, Query(max_length=80)] = None,
    published: bool | None = None,
) -> Page[TeamMemberAdminOut]:
    return await service.list_admin(page, q, published)


@admin_router.post("", response_model=TeamMemberAdminOut, status_code=201)
async def admin_create(
    body: TeamMemberIn,
    principal: CanWrite,
    request: Request,
) -> TeamMemberAdminOut:
    return await service.create(
        principal,
        body,
        hash_ip(client_ip(request)),
    )


@admin_router.get("/{member_id}", response_model=TeamMemberAdminOut)
async def admin_get(
    member_id: str,
    _: CanRead,
) -> TeamMemberAdminOut:
    return await service.get_admin(member_id)


@admin_router.patch("/{member_id}", response_model=TeamMemberAdminOut)
async def admin_update(
    member_id: str,
    body: TeamMemberUpdate,
    principal: CanWrite,
    request: Request,
) -> TeamMemberAdminOut:
    return await service.update(
        principal,
        member_id,
        body,
        hash_ip(client_ip(request)),
    )


@admin_router.delete("/{member_id}", status_code=204)
async def admin_delete(
    member_id: str,
    principal: CanWrite,
    request: Request,
) -> None:
    await service.delete(
        principal,
        member_id,
        hash_ip(client_ip(request)),
    )
