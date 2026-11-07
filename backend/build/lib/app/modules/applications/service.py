"""Business rules for applications. Audit calls live here, not in the router.

CVs go to the private bucket under a random key. The only way to read one is a short-lived
signed link, and every link that is issued is audited.
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from beanie import PydanticObjectId

from app.core.deps import Principal
from app.core.errors import NotFound, ValidationFailed
from app.core.pagination import Page, PageParams
from app.core.phone import normalise_e164
from app.core.storage import Bucket, get_storage
from app.modules.applications import repository as repo
from app.modules.applications import rules
from app.modules.applications.models import Application, ApplicationEvent, Stage
from app.modules.applications.schemas import (
    ApplicationCreate,
    ApplicationDetail,
    ApplicationEventOut,
    ApplicationItem,
    ApplicationReceived,
    ApplicationUpdate,
    CvLink,
)
from app.modules.audit import service as audit
from app.modules.auth.models import User
from app.modules.jobs import repository as jobs_repo

ITEM_TYPE = "application"
GENERIC_FAILURE = "We couldn't send that. Please try WhatsApp or call us."


def _snapshot(doc: Application) -> dict:
    return {"stage": doc.stage, "rating": doc.rating, "decline_reason": doc.decline_reason}


def _uid(principal: Principal) -> str | None:
    return principal.user_id if PydanticObjectId.is_valid(principal.user_id) else None


def to_item(doc: Application) -> ApplicationItem:
    return ApplicationItem(
        id=str(doc.id),
        name=doc.name,
        job_id=str(doc.job_id) if doc.job_id else None,
        job_title=doc.job_title_snapshot or rules.GENERAL_INTEREST,
        experience_years=doc.experience_years,
        stage=doc.stage,
        rating=doc.rating,
        applied_at=doc.created_at,
    )


async def _user_names(events: list[ApplicationEvent]) -> dict[str, str]:
    ids = {PydanticObjectId(e.user_id) for e in events if e.user_id and _valid(e.user_id)}
    if not ids:
        return {}
    users = await User.find({"_id": {"$in": list(ids)}}).to_list()
    return {str(u.id): u.name for u in users}


def _valid(value: str) -> bool:
    return PydanticObjectId.is_valid(value)


async def to_detail(doc: Application) -> ApplicationDetail:
    names = await _user_names(doc.events)
    return ApplicationDetail(
        **to_item(doc).model_dump(),
        phone_e164=doc.phone_e164,
        email=doc.email,
        registration_number=doc.registration_number,
        qualification=doc.qualification,
        area=doc.area,
        availability=doc.availability,
        cover_note=doc.cover_note,
        cv_file_name=doc.cv_file_name,
        cv_available=bool(doc.cv_file_key),
        decline_reason=doc.decline_reason,
        answers={},
        events=[
            ApplicationEventOut(at=e.at, text=e.text, user_name=names.get(e.user_id or ""))
            for e in doc.events
        ],
    )


async def scan_cv(data: bytes) -> bool:
    """Virus scan hook (spec 9.6). Returns False to refuse the file.

    TODO(owner): no scanner is chosen (ClamAV or a provider). Until then every file that passed
    the type and size checks is accepted.
    """
    return True


async def create_public(
    body: ApplicationCreate, cv_name: str, cv_data: bytes, ip_hash: str | None
) -> ApplicationReceived:
    """Checks run cheapest first: honeypot, file, then the database."""
    if body.website.strip():
        raise ValidationFailed(GENERIC_FAILURE)
    if not cv_data:
        raise ValidationFailed("Choose a CV file.", {"cv": "required"})
    if len(cv_data) > rules.CV_MAX_BYTES:
        raise ValidationFailed("The file must be smaller than 5 MB.", {"cv": "too large"})
    detected = rules.detect_cv_type(cv_data, cv_name)
    if detected is None:
        raise ValidationFailed("Choose a PDF or Word file.", {"cv": "wrong type"})
    mime, extension = detected

    job_id: PydanticObjectId | None = None
    title = ""
    registration_required = False
    if body.job_id:
        job = await jobs_repo.get_public(body.job_id)
        if job is None:
            raise ValidationFailed("That role is no longer open.", {"job_id": "not open"})
        job_id = job.id
        title = job.title.get("en") or next(iter(job.title.values()), "")
        registration_required = job.registration_required
    if registration_required and not body.registration_number:
        raise ValidationFailed(
            "Enter your professional registration number.", {"registration_number": "required"}
        )
    if not await scan_cv(cv_data):
        raise ValidationFailed(GENERIC_FAILURE, {"cv": "refused"})

    phone_e164 = normalise_e164(body.phone)
    if phone_e164 is None:  # unreachable: the schema already checked it
        raise ValidationFailed("Enter a valid Uganda phone number.", {"phone": "invalid"})
    now = datetime.now(UTC)
    key = f"cv/{uuid4().hex}.{extension}"
    await get_storage().put(Bucket.PRIVATE, key, cv_data, mime)
    doc = Application(
        job_id=job_id,
        job_title_snapshot=title or rules.GENERAL_INTEREST,
        name=body.name,
        phone_raw=body.phone,
        phone_e164=phone_e164,
        email=str(body.email),
        registration_number=body.registration_number,
        qualification=body.qualification,
        experience_years=body.experience_years,
        area=body.area,
        availability=body.availability,
        cv_file_key=key,
        cv_file_name=rules.safe_file_name(cv_name),
        cover_note=body.cover_note,
        consent=True,
        consent_at=now,
        ip_hash=ip_hash,
        delete_after=rules.delete_after(now),
        events=[ApplicationEvent(kind="received", text="Application received from the website")],
    )
    try:
        await doc.insert()
    except Exception:
        await get_storage().delete(Bucket.PRIVATE, key)  # no CV without a record
        raise
    return ApplicationReceived()


async def list_admin(
    page: PageParams, stage: Stage | None, job_id: str | None, q: str | None
) -> Page[ApplicationItem]:
    docs, total = await repo.list_admin(page, stage, job_id, q)
    return Page(
        items=[to_item(d) for d in docs], total=total, page=page.page, page_size=page.page_size
    )


async def _get(application_id: str) -> Application:
    doc = await repo.get(application_id)
    if doc is None:
        raise NotFound("Application not found.")
    return doc


async def get_admin(application_id: str) -> ApplicationDetail:
    return await to_detail(await _get(application_id))


async def update(
    principal: Principal, application_id: str, body: ApplicationUpdate, ip_hash: str | None
) -> ApplicationDetail:
    doc = await _get(application_id)
    changes = body.model_dump(exclude_unset=True)
    if "stage" in changes and changes["stage"] is None:
        raise ValidationFailed("Choose a stage.", {"stage": "required"})
    before = _snapshot(doc)
    stage = changes.get("stage", doc.stage)
    reason = changes["decline_reason"] if "decline_reason" in changes else doc.decline_reason
    if stage == "declined":
        if not (reason or "").strip():
            raise ValidationFailed(
                "Please give a reason for declining.", {"decline_reason": "required"}
            )
    else:
        reason = None  # a reason only belongs to a declined application
    events: list[ApplicationEvent] = []
    uid = _uid(principal)
    if stage != doc.stage:
        events.append(
            ApplicationEvent(
                user_id=uid,
                kind="stage_change",
                data={"from": doc.stage, "to": stage},
                text=f"Stage changed from {doc.stage} to {stage}",
            )
        )
    if "rating" in changes and changes["rating"] != doc.rating:
        events.append(
            ApplicationEvent(
                user_id=uid,
                kind="rating",
                data={"from": doc.rating, "to": changes["rating"]},
                text="Rating changed",
            )
        )
    doc.stage = stage
    doc.decline_reason = reason
    if "rating" in changes:
        doc.rating = changes["rating"]
    doc.events.extend(events)
    await doc.save()
    await audit.record(
        principal,
        "application.update",
        ITEM_TYPE,
        str(doc.id),
        doc.name,
        before=before,
        after=_snapshot(doc),
        ip_hash=ip_hash,
    )
    return await to_detail(doc)


async def add_note(
    principal: Principal, application_id: str, text: str, ip_hash: str | None
) -> ApplicationDetail:
    doc = await _get(application_id)
    await repo.push_event(doc.id, ApplicationEvent(user_id=_uid(principal), kind="note", text=text))
    # The note text stays out of the audit log: it can hold personal opinions about a person.
    await audit.record(
        principal, "application.note", ITEM_TYPE, str(doc.id), doc.name, ip_hash=ip_hash
    )
    return await to_detail(await _get(application_id))


async def cv_link(principal: Principal, application_id: str, ip_hash: str | None) -> CvLink:
    doc = await _get(application_id)
    if not doc.cv_file_key:
        raise NotFound("No CV on file.")
    url = await get_storage().signed_url(Bucket.PRIVATE, doc.cv_file_key, rules.CV_LINK_SECONDS)
    await repo.push_event(
        doc.id, ApplicationEvent(user_id=_uid(principal), kind="cv_viewed", text="CV opened")
    )
    await audit.record(
        principal, "application.cv_view", ITEM_TYPE, str(doc.id), doc.name, ip_hash=ip_hash
    )
    return CvLink(url=url, expires_at=datetime.now(UTC) + timedelta(seconds=rules.CV_LINK_SECONDS))
