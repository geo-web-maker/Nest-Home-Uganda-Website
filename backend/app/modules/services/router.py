"""Routers contain no business logic. Scope map: GET needs content:read, writes content:write.

Publishing (changing `published`) also needs content:publish, checked in the service.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response

from app.core.deps import Principal, require_scopes
from app.core.i18n import language
from app.core.pagination import Page, PageParams, page_params
from app.core.rate_limit import client_ip
from app.core.security import hash_ip
from app.modules.services import service
from app.modules.services.schemas import (
    ServiceAdminOut,
    ServiceIn,
    ServicePublicCard,
    ServicePublicDetail,
    ServiceUpdate,
)

public_router = APIRouter(prefix="/public/services", tags=["public-services"])
admin_router = APIRouter(prefix="/admin/services", tags=["admin-services"])

CACHE_PUBLIC = "public, max-age=60"

CanRead = Annotated[Principal, Depends(require_scopes("content:read"))]
CanWrite = Annotated[Principal, Depends(require_scopes("content:write"))]


@public_router.get("", response_model=list[ServicePublicCard])
async def public_list(
    response: Response, lang: Annotated[str, Depends(language)]
) -> list[ServicePublicCard]:
    response.headers["Cache-Control"] = CACHE_PUBLIC
    return await service.public_list(lang)


@public_router.get("/{slug}", response_model=ServicePublicDetail)
async def public_detail(
    slug: str, response: Response, lang: Annotated[str, Depends(language)]
) -> ServicePublicDetail:
    response.headers["Cache-Control"] = CACHE_PUBLIC
    return await service.public_detail(slug, lang)


@admin_router.get("", response_model=Page[ServiceAdminOut])
async def admin_list(
    _: CanRead,
    page: Annotated[PageParams, Depends(page_params)],
    q: Annotated[str | None, Query(max_length=80)] = None,
    published: bool | None = None,
) -> Page[ServiceAdminOut]:
    return await service.list_admin(page, q, published)


@admin_router.post("", response_model=ServiceAdminOut, status_code=201)
async def admin_create(body: ServiceIn, principal: CanWrite, request: Request) -> ServiceAdminOut:
    return await service.create(principal, body, hash_ip(client_ip(request)))


@admin_router.get("/{service_id}", response_model=ServiceAdminOut)
async def admin_get(service_id: str, _: CanRead) -> ServiceAdminOut:
    return await service.get_admin(service_id)


@admin_router.patch("/{service_id}", response_model=ServiceAdminOut)
async def admin_update(
    service_id: str, body: ServiceUpdate, principal: CanWrite, request: Request
) -> ServiceAdminOut:
    return await service.update(principal, service_id, body, hash_ip(client_ip(request)))


@admin_router.delete("/{service_id}", status_code=204)
async def admin_delete(service_id: str, principal: CanWrite, request: Request) -> None:
    await service.delete(principal, service_id, hash_ip(client_ip(request)))
