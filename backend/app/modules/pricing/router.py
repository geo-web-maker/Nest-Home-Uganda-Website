"""Public reads and scope-protected admin content endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response

from app.core.deps import Principal, require_scopes
from app.core.i18n import language
from app.core.pagination import Page, PageParams, page_params
from app.core.rate_limit import client_ip
from app.core.security import hash_ip
from app.modules.pricing import service
from app.modules.pricing.schemas import (
    PricingBlockAdminOut,
    PricingBlockIn,
    PricingBlockPublic,
    PricingBlockUpdate,
)

public_router = APIRouter(prefix="/public/pricing", tags=["public-pricing"])
admin_router = APIRouter(prefix="/admin/pricing", tags=["admin-pricing"])

CACHE_PUBLIC = "public, max-age=60"
CanRead = Annotated[Principal, Depends(require_scopes("content:read"))]
CanWrite = Annotated[Principal, Depends(require_scopes("content:write"))]


@public_router.get("", response_model=list[PricingBlockPublic])
async def public_list(
    response: Response, lang: Annotated[str, Depends(language)]
) -> list[PricingBlockPublic]:
    response.headers["Cache-Control"] = CACHE_PUBLIC
    return await service.public_list(lang)


@admin_router.get("", response_model=Page[PricingBlockAdminOut])
async def admin_list(
    _: CanRead,
    page: Annotated[PageParams, Depends(page_params)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    active: bool | None = None,
) -> Page[PricingBlockAdminOut]:
    return await service.list_admin(page, q, active)


@admin_router.post("", response_model=PricingBlockAdminOut, status_code=201)
async def admin_create(
    body: PricingBlockIn, principal: CanWrite, request: Request
) -> PricingBlockAdminOut:
    return await service.create(principal, body, hash_ip(client_ip(request)))


@admin_router.get("/{item_id}", response_model=PricingBlockAdminOut)
async def admin_get(item_id: str, _: CanRead) -> PricingBlockAdminOut:
    return await service.get_admin(item_id)


@admin_router.patch("/{item_id}", response_model=PricingBlockAdminOut)
async def admin_update(
    item_id: str, body: PricingBlockUpdate, principal: CanWrite, request: Request
) -> PricingBlockAdminOut:
    return await service.update(principal, item_id, body, hash_ip(client_ip(request)))


@admin_router.delete("/{item_id}", status_code=204)
async def admin_delete(item_id: str, principal: CanWrite, request: Request) -> None:
    await service.delete(principal, item_id, hash_ip(client_ip(request)))
