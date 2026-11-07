"""Public reads and scope-protected admin content endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response

from app.core.deps import Principal, require_scopes
from app.core.i18n import language
from app.core.pagination import Page, PageParams, page_params
from app.core.rate_limit import client_ip
from app.core.security import hash_ip
from app.modules.testimonials import service
from app.modules.testimonials.schemas import (
    TestimonialAdminOut,
    TestimonialIn,
    TestimonialPublic,
    TestimonialUpdate,
)

public_router = APIRouter(prefix="/public/testimonials", tags=["public-testimonials"])
admin_router = APIRouter(prefix="/admin/testimonials", tags=["admin-testimonials"])

CACHE_PUBLIC = "public, max-age=60"
CanRead = Annotated[Principal, Depends(require_scopes("content:read"))]
CanWrite = Annotated[Principal, Depends(require_scopes("content:write"))]


@public_router.get("", response_model=list[TestimonialPublic])
async def public_list(
    response: Response, lang: Annotated[str, Depends(language)]
) -> list[TestimonialPublic]:
    response.headers["Cache-Control"] = CACHE_PUBLIC
    return await service.public_list(lang)


@admin_router.get("", response_model=Page[TestimonialAdminOut])
async def admin_list(
    _: CanRead,
    page: Annotated[PageParams, Depends(page_params)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    active: bool | None = None,
) -> Page[TestimonialAdminOut]:
    return await service.list_admin(page, q, active)


@admin_router.post("", response_model=TestimonialAdminOut, status_code=201)
async def admin_create(
    body: TestimonialIn, principal: CanWrite, request: Request
) -> TestimonialAdminOut:
    return await service.create(principal, body, hash_ip(client_ip(request)))


@admin_router.get("/{item_id}", response_model=TestimonialAdminOut)
async def admin_get(item_id: str, _: CanRead) -> TestimonialAdminOut:
    return await service.get_admin(item_id)


@admin_router.patch("/{item_id}", response_model=TestimonialAdminOut)
async def admin_update(
    item_id: str, body: TestimonialUpdate, principal: CanWrite, request: Request
) -> TestimonialAdminOut:
    return await service.update(principal, item_id, body, hash_ip(client_ip(request)))


@admin_router.delete("/{item_id}", status_code=204)
async def admin_delete(item_id: str, principal: CanWrite, request: Request) -> None:
    await service.delete(principal, item_id, hash_ip(client_ip(request)))
