"""Public jobs and scope-protected career administration."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response

from app.core.deps import Principal, require_scopes
from app.core.i18n import language
from app.core.pagination import Page, PageParams, page_params
from app.core.rate_limit import client_ip
from app.core.security import hash_ip
from app.modules.jobs import service
from app.modules.jobs.schemas import JobAdminOut, JobIn, JobPublicOut, JobUpdate

public_router = APIRouter(prefix="/public/jobs", tags=["public-jobs"])
admin_router = APIRouter(prefix="/admin/jobs", tags=["admin-jobs"])
CACHE_PUBLIC = "public, max-age=60"
CanRead = Annotated[Principal, Depends(require_scopes("jobs:read"))]
CanWrite = Annotated[Principal, Depends(require_scopes("jobs:write"))]


@public_router.get("", response_model=list[JobPublicOut])
async def public_list(
    response: Response, lang: Annotated[str, Depends(language)]
) -> list[JobPublicOut]:
    response.headers["Cache-Control"] = CACHE_PUBLIC
    return await service.public_list(lang)


@public_router.get("/{job_id}", response_model=JobPublicOut)
async def public_detail(
    job_id: str, response: Response, lang: Annotated[str, Depends(language)]
) -> JobPublicOut:
    response.headers["Cache-Control"] = CACHE_PUBLIC
    return await service.public_detail(job_id, lang)


@admin_router.get("", response_model=Page[JobAdminOut])
async def admin_list(
    _: CanRead,
    page: Annotated[PageParams, Depends(page_params)],
    q: Annotated[str | None, Query(max_length=80)] = None,
    published: bool | None = None,
) -> Page[JobAdminOut]:
    return await service.list_admin(page, q, published)


@admin_router.post("", response_model=JobAdminOut, status_code=201)
async def admin_create(body: JobIn, principal: CanWrite, request: Request) -> JobAdminOut:
    return await service.create(principal, body, hash_ip(client_ip(request)))


@admin_router.get("/{job_id}", response_model=JobAdminOut)
async def admin_get(job_id: str, _: CanRead) -> JobAdminOut:
    return await service.get_admin(job_id)


@admin_router.patch("/{job_id}", response_model=JobAdminOut)
async def admin_update(
    job_id: str, body: JobUpdate, principal: CanWrite, request: Request
) -> JobAdminOut:
    return await service.update(principal, job_id, body, hash_ip(client_ip(request)))


@admin_router.post("/{job_id}/publish", response_model=JobAdminOut)
async def admin_publish(job_id: str, principal: CanWrite, request: Request) -> JobAdminOut:
    return await service.publish(principal, job_id, hash_ip(client_ip(request)))


@admin_router.post("/{job_id}/close", response_model=JobAdminOut)
async def admin_close(job_id: str, principal: CanWrite, request: Request) -> JobAdminOut:
    return await service.close(principal, job_id, hash_ip(client_ip(request)))


@admin_router.delete("/{job_id}", status_code=204)
async def admin_delete(job_id: str, principal: CanWrite, request: Request) -> None:
    await service.delete(principal, job_id, hash_ip(client_ip(request)))
