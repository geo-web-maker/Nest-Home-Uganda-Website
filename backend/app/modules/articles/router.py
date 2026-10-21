"""Public reads and scope-protected admin content endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response

from app.core.deps import Principal, require_scopes
from app.core.i18n import language
from app.core.pagination import Page, PageParams, page_params
from app.core.rate_limit import client_ip
from app.core.security import hash_ip
from app.modules.articles import service
from app.modules.articles.schemas import ArticleAdminOut, ArticleIn, ArticlePublic, ArticleUpdate

public_router = APIRouter(prefix="/public/articles", tags=["public-articles"])
admin_router = APIRouter(prefix="/admin/articles", tags=["admin-articles"])

CACHE_PUBLIC = "public, max-age=60"
CanRead = Annotated[Principal, Depends(require_scopes("content:read"))]
CanWrite = Annotated[Principal, Depends(require_scopes("content:write"))]


@public_router.get("", response_model=list[ArticlePublic])
async def public_list(
    response: Response, lang: Annotated[str, Depends(language)]
) -> list[ArticlePublic]:
    response.headers["Cache-Control"] = CACHE_PUBLIC
    return await service.public_list(lang)


@public_router.get("/{slug}", response_model=ArticlePublic)
async def public_detail(
    slug: str, response: Response, lang: Annotated[str, Depends(language)]
) -> ArticlePublic:
    response.headers["Cache-Control"] = CACHE_PUBLIC
    return await service.public_detail(slug, lang)


@admin_router.get("", response_model=Page[ArticleAdminOut])
async def admin_list(
    _: CanRead,
    page: Annotated[PageParams, Depends(page_params)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    active: bool | None = None,
) -> Page[ArticleAdminOut]:
    return await service.list_admin(page, q, active)


@admin_router.post("", response_model=ArticleAdminOut, status_code=201)
async def admin_create(body: ArticleIn, principal: CanWrite, request: Request) -> ArticleAdminOut:
    return await service.create(principal, body, hash_ip(client_ip(request)))


@admin_router.get("/{item_id}", response_model=ArticleAdminOut)
async def admin_get(item_id: str, _: CanRead) -> ArticleAdminOut:
    return await service.get_admin(item_id)


@admin_router.patch("/{item_id}", response_model=ArticleAdminOut)
async def admin_update(
    item_id: str, body: ArticleUpdate, principal: CanWrite, request: Request
) -> ArticleAdminOut:
    return await service.update(principal, item_id, body, hash_ip(client_ip(request)))


@admin_router.delete("/{item_id}", status_code=204)
async def admin_delete(item_id: str, principal: CanWrite, request: Request) -> None:
    await service.delete(principal, item_id, hash_ip(client_ip(request)))
