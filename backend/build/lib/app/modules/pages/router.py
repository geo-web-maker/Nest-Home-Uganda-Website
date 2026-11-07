"""Public reads and scope-protected admin content endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response

from app.core.deps import Principal, require_scopes
from app.core.i18n import language
from app.core.pagination import Page, PageParams, page_params
from app.core.rate_limit import client_ip
from app.core.security import hash_ip
from app.modules.pages import service
from app.modules.pages.schemas import (
    ContentPageAdminOut,
    ContentPageIn,
    ContentPagePublic,
    ContentPageUpdate,
)

public_router = APIRouter(prefix="/public/pages", tags=["public-pages"])
admin_router = APIRouter(prefix="/admin/pages", tags=["admin-pages"])

CACHE_PUBLIC = "public, max-age=60"
CanRead = Annotated[Principal, Depends(require_scopes("content:read"))]
CanWrite = Annotated[Principal, Depends(require_scopes("content:write"))]


@public_router.get("/{key}", response_model=ContentPagePublic)
async def public_detail(
    key: str, response: Response, lang: Annotated[str, Depends(language)]
) -> ContentPagePublic:
    response.headers["Cache-Control"] = CACHE_PUBLIC
    return await service.public_detail(key, lang)


@admin_router.get("", response_model=Page[ContentPageAdminOut])
async def admin_list(
    _: CanRead,
    page: Annotated[PageParams, Depends(page_params)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    active: bool | None = None,
) -> Page[ContentPageAdminOut]:
    return await service.list_admin(page, q, active)


@admin_router.post("", response_model=ContentPageAdminOut, status_code=201)
async def admin_create(
    body: ContentPageIn, principal: CanWrite, request: Request
) -> ContentPageAdminOut:
    return await service.create(principal, body, hash_ip(client_ip(request)))


@admin_router.get("/{item_id}", response_model=ContentPageAdminOut)
async def admin_get(item_id: str, _: CanRead) -> ContentPageAdminOut:
    return await service.get_admin(item_id)


@admin_router.patch("/{item_id}", response_model=ContentPageAdminOut)
async def admin_update(
    item_id: str, body: ContentPageUpdate, principal: CanWrite, request: Request
) -> ContentPageAdminOut:
    return await service.update(principal, item_id, body, hash_ip(client_ip(request)))


@admin_router.delete("/{item_id}", status_code=204)
async def admin_delete(item_id: str, principal: CanWrite, request: Request) -> None:
    await service.delete(principal, item_id, hash_ip(client_ip(request)))
