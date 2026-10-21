"""Job business rules. Audit/version calls stay out of the router."""

from datetime import UTC, datetime
from typing import Any

from app.core.deps import Principal
from app.core.errors import NotFound, ValidationFailed
from app.core.i18n import resolve
from app.core.pagination import Page, PageParams
from app.modules.audit import service as audit
from app.modules.jobs import repository as repo
from app.modules.jobs.models import Job
from app.modules.jobs.schemas import JobAdminOut, JobIn, JobPublicOut, JobUpdate

ITEM_TYPE = "job"
_TEXT_FIELDS = {"title", "description", "requirements"}


def _snapshot(doc: Job) -> dict[str, Any]:
    return doc.model_dump(mode="json", exclude={"id", "revision_id"})


def _label(doc: Job) -> str:
    return doc.title.get("en") or next(iter(doc.title.values()), "Job")


async def to_admin(doc: Job) -> JobAdminOut:
    data = doc.model_dump(exclude={"id", "revision_id", "deleted_at"})
    count = await repo.applicants_count(doc.id)
    return JobAdminOut(id=str(doc.id), applicants_count=count, **data)


def _public(doc: Job, lang: str) -> JobPublicOut:
    closes = doc.closes_on if doc.show_closing else None
    return JobPublicOut(
        id=str(doc.id),
        title=resolve(doc.title, lang),
        department=doc.department,
        location=doc.location,
        type=doc.type,
        description=resolve(doc.description, lang),
        requirements=resolve(doc.requirements, lang),
        closes_on=closes,
        registration_required=doc.registration_required,
    )


async def list_admin(page: PageParams, q: str | None, published: bool | None) -> Page[JobAdminOut]:
    docs, total = await repo.list_admin(page, q, published)
    return Page(
        items=[await to_admin(doc) for doc in docs],
        total=total,
        page=page.page,
        page_size=page.page_size,
    )


async def get_admin(job_id: str) -> JobAdminOut:
    doc = await repo.get(job_id)
    if doc is None:
        raise NotFound("Job not found.")
    return await to_admin(doc)


async def public_list(lang: str) -> list[JobPublicOut]:
    return [_public(doc, lang) for doc in await repo.list_public()]


async def public_detail(job_id: str, lang: str) -> JobPublicOut:
    doc = await repo.get_public(job_id)
    if doc is None:
        raise NotFound("Job not found.")
    return _public(doc, lang)


async def create(principal: Principal, body: JobIn, ip_hash: str | None) -> JobAdminOut:
    data = body.model_dump()
    # New jobs are always drafts. Publication is an explicit action in the editor.
    data["published"] = False
    doc = Job(**data)
    await doc.insert()
    await audit.record(
        principal, "job.create", ITEM_TYPE, str(doc.id), _label(doc), after=_snapshot(doc),
        ip_hash=ip_hash,
    )
    return await to_admin(doc)


async def update(
    principal: Principal, job_id: str, body: JobUpdate, ip_hash: str | None
) -> JobAdminOut:
    doc = await repo.get(job_id)
    if doc is None:
        raise NotFound("Job not found.")
    changes = body.model_dump(exclude_unset=True)
    if changes.get("published") is True and not doc.published:
        raise ValidationFailed(
            "Use the publish action to publish a job.",
            {"published": "use publish action"},
        )
    for key in (
        "title", "location", "department", "type", "description", "requirements",
        "registration_required", "show_closing", "published",
    ):

        if key in changes and changes[key] is None and key not in _TEXT_FIELDS:
            raise ValidationFailed("This field cannot be empty.", {key: "required"})
    if "title" in changes and changes["title"] is None:
        raise ValidationFailed("This field cannot be empty.", {"title": "required"})
    if "location" in changes and not str(changes["location"]).strip():
        raise ValidationFailed("This field cannot be empty.", {"location": "required"})
    before = _snapshot(doc)
    await audit.save_version(principal, ITEM_TYPE, str(doc.id), before)
    for key, value in changes.items():
        if value is None and key in _TEXT_FIELDS:
            value = {}
        setattr(doc, key, value)
    # Explicitly unpublishing an expired job is permitted; a published past-deadline job
    # remains hidden from the public query regardless.
    await doc.save()
    await audit.record(
        principal, "job.update", ITEM_TYPE, str(doc.id), _label(doc), before=before,
        after=_snapshot(doc), ip_hash=ip_hash,
    )
    return await to_admin(doc)


async def publish(principal: Principal, job_id: str, ip_hash: str | None) -> JobAdminOut:
    doc = await repo.get(job_id)
    if doc is None:
        raise NotFound("Job not found.")
    if doc.closes_on and doc.closes_on < repo.local_today():
        raise ValidationFailed(
            "A job past its closing date cannot be published.",
            {"closes_on": "date has passed"},
        )
    before = _snapshot(doc)
    await audit.save_version(principal, ITEM_TYPE, str(doc.id), before)
    doc.published = True
    doc.closed_at = None
    await doc.save()
    await audit.record(
        principal, "job.publish", ITEM_TYPE, str(doc.id), _label(doc), before=before,
        after=_snapshot(doc), ip_hash=ip_hash,
    )
    return await to_admin(doc)


async def close(principal: Principal, job_id: str, ip_hash: str | None) -> JobAdminOut:
    doc = await repo.get(job_id)
    if doc is None:
        raise NotFound("Job not found.")
    before = _snapshot(doc)
    await audit.save_version(principal, ITEM_TYPE, str(doc.id), before)
    doc.closed_at = datetime.now(UTC)
    doc.published = False
    await doc.save()
    await audit.record(
        principal, "job.close", ITEM_TYPE, str(doc.id), _label(doc), before=before,
        after=_snapshot(doc), ip_hash=ip_hash,
    )
    return await to_admin(doc)


async def delete(principal: Principal, job_id: str, ip_hash: str | None) -> None:
    doc = await repo.get(job_id)
    if doc is None:
        raise NotFound("Job not found.")
    before = _snapshot(doc)
    await audit.save_version(principal, ITEM_TYPE, str(doc.id), before)
    doc.deleted_at = datetime.now(UTC)
    doc.published = False
    if doc.closed_at is None:
        doc.closed_at = datetime.now(UTC)
    await doc.save()
    await audit.record(
        principal, "job.delete", ITEM_TYPE, str(doc.id), _label(doc), before=before,
        ip_hash=ip_hash,
    )
