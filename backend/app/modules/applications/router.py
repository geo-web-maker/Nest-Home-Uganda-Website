"""Routers contain no business logic. Reads need applications:read, writes applications:write.

The public POST is rate limited (3 per IP per day, spec 6.4) before anything else runs and
reads the CV one byte past the limit so an oversized upload is refused without loading it all.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError

from app.core.deps import Principal, require_scopes
from app.core.pagination import Page, PageParams, page_params
from app.core.rate_limit import client_ip, rate_limit
from app.core.security import hash_ip
from app.modules.applications import rules, service
from app.modules.applications.models import Stage
from app.modules.applications.schemas import (
    ApplicationCreate,
    ApplicationDetail,
    ApplicationItem,
    ApplicationReceived,
    ApplicationUpdate,
    CvLink,
    NoteIn,
)

public_router = APIRouter(prefix="/public/applications", tags=["public-applications"])
admin_router = APIRouter(prefix="/admin/applications", tags=["admin-applications"])

CanRead = Annotated[Principal, Depends(require_scopes("applications:read"))]
CanWrite = Annotated[Principal, Depends(require_scopes("applications:write"))]
Text = Annotated[str, Form()]


@public_router.post(
    "",
    response_model=ApplicationReceived,
    status_code=201,
    dependencies=[Depends(rate_limit("application", 3, 86400))],
)
async def public_create(
    request: Request,
    cv: Annotated[UploadFile, File()],
    name: Text,
    phone: Text,
    email: Text,
    qualification: Text,
    experience_years: Text,
    area: Text,
    availability: Text,
    consent: Text,
    job_id: Text = "",
    registration_number: Text = "",
    cover_note: Text = "",
    website: Text = "",
) -> ApplicationReceived:
    try:
        body = ApplicationCreate.model_validate(
            {
                "job_id": job_id,
                "name": name,
                "phone": phone,
                "email": email,
                "registration_number": registration_number,
                "qualification": qualification,
                "experience_years": experience_years,
                "area": area,
                "availability": availability,
                "cover_note": cover_note,
                "consent": consent.strip().lower() in {"true", "1", "on", "yes"},
                "website": website,
            }
        )
    except ValidationError as exc:
        raise RequestValidationError(exc.errors(include_context=False)) from exc
    data = await cv.read(rules.CV_MAX_BYTES + 1)
    return await service.create_public(
        body, cv.filename or "", data, hash_ip(client_ip(request))
    )


@admin_router.get("", response_model=Page[ApplicationItem])
async def admin_list(
    _: CanRead,
    page: Annotated[PageParams, Depends(page_params)],
    stage: Stage | None = None,
    job: Annotated[str | None, Query(max_length=24)] = None,
    q: Annotated[str | None, Query(max_length=80)] = None,
) -> Page[ApplicationItem]:
    return await service.list_admin(page, stage, job, q)


@admin_router.get("/{application_id}", response_model=ApplicationDetail)
async def admin_get(application_id: str, _: CanRead) -> ApplicationDetail:
    return await service.get_admin(application_id)


@admin_router.patch("/{application_id}", response_model=ApplicationDetail)
async def admin_update(
    application_id: str, body: ApplicationUpdate, principal: CanWrite, request: Request
) -> ApplicationDetail:
    return await service.update(principal, application_id, body, hash_ip(client_ip(request)))


@admin_router.post("/{application_id}/notes", response_model=ApplicationDetail, status_code=201)
async def admin_add_note(
    application_id: str, body: NoteIn, principal: CanWrite, request: Request
) -> ApplicationDetail:
    return await service.add_note(principal, application_id, body.text, hash_ip(client_ip(request)))


@admin_router.get("/{application_id}/cv", response_model=CvLink)
async def admin_cv(application_id: str, principal: CanRead, request: Request) -> CvLink:
    return await service.cv_link(principal, application_id, hash_ip(client_ip(request)))
