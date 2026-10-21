"""Public reads and scope-protected admin content endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response

from app.core.deps import Principal, require_scopes
from app.core.i18n import language
from app.core.pagination import Page, PageParams, page_params
from app.core.rate_limit import client_ip
from app.core.security import hash_ip
from app.modules.faqs import service
from app.modules.faqs.schemas import FaqAdminOut, FaqIn, FaqPublic, FaqUpdate

public_router = APIRouter(prefix="/public/faqs", tags=["public-faqs"])
admin_router = APIRouter(prefix="/admin/faqs", tags=["admin-faqs"])

CACHE_PUBLIC = "public, max-age=60"
CanRead = Annotated[Principal, Depends(require_scopes("content:read"))]
CanWrite = Annotated[Principal, Depends(require_scopes("content:write"))]


@public_router.get("", response_model=list[FaqPublic])
async def public_list(
    response: Response, lang: Annotated[str, Depends(language)]
) -> list[FaqPublic]:
    response.headers["Cache-Control"] = CACHE_PUBLIC
    return await service.public_list(lang)


@admin_router.get("", response_model=Page[FaqAdminOut])
async def admin_list(
    _: CanRead,
    page: Annotated[PageParams, Depends(page_params)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    active: bool | None = None,
) -> Page[FaqAdminOut]:
    return await service.list_admin(page, q, active)


@admin_router.post("", response_model=FaqAdminOut, status_code=201)
async def admin_create(body: FaqIn, principal: CanWrite, request: Request) -> FaqAdminOut:
    return await service.create(principal, body, hash_ip(client_ip(request)))


@admin_router.get("/{item_id}", response_model=FaqAdminOut)
async def admin_get(item_id: str, _: CanRead) -> FaqAdminOut:
    return await service.get_admin(item_id)


@admin_router.patch("/{item_id}", response_model=FaqAdminOut)
async def admin_update(
    item_id: str, body: FaqUpdate, principal: CanWrite, request: Request
) -> FaqAdminOut:
    return await service.update(principal, item_id, body, hash_ip(client_ip(request)))


@admin_router.delete("/{item_id}", status_code=204)
async def admin_delete(item_id: str, principal: CanWrite, request: Request) -> None:
    await service.delete(principal, item_id, hash_ip(client_ip(request)))
