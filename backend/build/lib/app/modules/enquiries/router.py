"""Routers contain no business logic. Scope map: reads need enquiries:read, writes enquiries:write.

The public POST is rate limited (5 per IP per hour, spec 6.4) before anything else runs.
Notifications are queued as a background task so they can never fail or delay the reply.
"""

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Header, Query, Request

from app.core.deps import Principal, require_scopes
from app.core.i18n import language
from app.core.pagination import Page, PageParams, page_params
from app.core.rate_limit import client_ip, rate_limit
from app.core.security import hash_ip
from app.modules.enquiries import service
from app.modules.enquiries.models import Status
from app.modules.enquiries.schemas import (
    EnquiryCreate,
    EnquiryCreated,
    EnquiryDetail,
    EnquiryListItem,
    EnquiryManualIn,
    EnquiryUpdate,
    NoteIn,
)
from app.modules.notifications import service as notifications

public_router = APIRouter(prefix="/public/enquiries", tags=["public-enquiries"])
admin_router = APIRouter(prefix="/admin/enquiries", tags=["admin-enquiries"])

CanRead = Annotated[Principal, Depends(require_scopes("enquiries:read"))]
CanWrite = Annotated[Principal, Depends(require_scopes("enquiries:write"))]


@public_router.post(
    "",
    response_model=EnquiryCreated,
    status_code=201,
    dependencies=[Depends(rate_limit("enquiry", 5, 3600))],
)
async def public_create(
    body: EnquiryCreate,
    request: Request,
    background: BackgroundTasks,
    lang: Annotated[str, Depends(language)],
    user_agent: Annotated[str | None, Header(max_length=400)] = None,
) -> EnquiryCreated:
    created, enquiry_id = await service.create_public(
        body, lang, hash_ip(client_ip(request)), user_agent
    )
    background.add_task(notifications.notify_new_enquiry, enquiry_id)
    return created


@admin_router.get("", response_model=Page[EnquiryListItem])
async def admin_list(
    _: CanRead,
    page: Annotated[PageParams, Depends(page_params)],
    q: Annotated[str | None, Query(max_length=80)] = None,
    status: Status | None = None,
    svc: Annotated[str | None, Query(alias="service", max_length=24)] = None,
    assigned_to: Annotated[str | None, Query(max_length=24)] = None,
    start: Annotated[datetime | None, Query(alias="from")] = None,
    end: Annotated[datetime | None, Query(alias="to")] = None,
    sort: Literal["-created_at", "created_at"] = "-created_at",
) -> Page[EnquiryListItem]:
    return await service.list_admin(
        page, q, status, svc, assigned_to, start, end, sort == "created_at"
    )


@admin_router.post("", response_model=EnquiryDetail, status_code=201)
async def admin_create(
    body: EnquiryManualIn, principal: CanWrite, request: Request
) -> EnquiryDetail:
    return await service.create_manual(principal, body, hash_ip(client_ip(request)))


@admin_router.get("/{enquiry_id}", response_model=EnquiryDetail)
async def admin_get(enquiry_id: str, _: CanRead) -> EnquiryDetail:
    return await service.get_admin(enquiry_id)


@admin_router.patch("/{enquiry_id}", response_model=EnquiryDetail)
async def admin_update(
    enquiry_id: str, body: EnquiryUpdate, principal: CanWrite, request: Request
) -> EnquiryDetail:
    return await service.update(principal, enquiry_id, body, hash_ip(client_ip(request)))


@admin_router.post("/{enquiry_id}/notes", response_model=EnquiryDetail, status_code=201)
async def admin_add_note(
    enquiry_id: str, body: NoteIn, principal: CanWrite, request: Request
) -> EnquiryDetail:
    return await service.add_note(principal, enquiry_id, body.text, hash_ip(client_ip(request)))
