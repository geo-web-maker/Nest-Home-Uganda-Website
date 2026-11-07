"""Media library endpoints. Reads need content:read, writes need media:write."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile

from app.core.deps import Principal, require_scopes
from app.core.pagination import Page, PageParams, page_params
from app.core.rate_limit import client_ip
from app.core.security import hash_ip
from app.modules.media import service
from app.modules.media.schemas import MediaAdminOut, MediaUpdate

router = APIRouter(prefix="/admin/media", tags=["admin-media"])
CanRead = Annotated[Principal, Depends(require_scopes("content:read"))]
CanWrite = Annotated[Principal, Depends(require_scopes("media:write"))]


@router.get("", response_model=Page[MediaAdminOut])
async def admin_list(
    _: CanRead,
    page: Annotated[PageParams, Depends(page_params)],
    q: Annotated[str | None, Query(max_length=100)] = None,
) -> Page[MediaAdminOut]:
    return await service.list_admin(page, q)


@router.post("", response_model=MediaAdminOut, status_code=201)
async def admin_upload(
    principal: CanWrite,
    request: Request,
    file: Annotated[UploadFile, File()],
    alt_text_en: Annotated[str, Form(max_length=300)] = "",
) -> MediaAdminOut:
    # Read one byte past the limit so an oversized file is rejected without loading all of it.
    data = await file.read(service.MAX_UPLOAD_BYTES + 1)
    alt = {"en": alt_text_en.strip()} if alt_text_en.strip() else {}
    return await service.create(principal, data, alt, hash_ip(client_ip(request)))


@router.patch("/{media_id}", response_model=MediaAdminOut)
async def admin_update(
    media_id: str, body: MediaUpdate, principal: CanWrite, request: Request
) -> MediaAdminOut:
    return await service.update(principal, media_id, body, hash_ip(client_ip(request)))


@router.delete("/{media_id}", status_code=204)
async def admin_delete(media_id: str, principal: CanWrite, request: Request) -> None:
    await service.delete(principal, media_id, hash_ip(client_ip(request)))
