"""Business rules for enquiries. Audit calls live here, not in the router."""

from datetime import UTC, datetime

from beanie import PydanticObjectId
from pymongo.errors import DuplicateKeyError

from app.core.config import get_settings
from app.core.deps import Principal
from app.core.errors import Conflict, NotFound, ValidationFailed
from app.core.i18n import DEFAULT_LANG, resolve
from app.core.pagination import Page, PageParams
from app.core.phone import normalise_e164
from app.modules.audit import service as audit
from app.modules.auth.models import User
from app.modules.enquiries import repository as repo
from app.modules.enquiries import rules
from app.modules.enquiries.models import Enquiry, EnquiryEvent, EnquiryService
from app.modules.enquiries.schemas import (
    EnquiryCreate,
    EnquiryCreated,
    EnquiryDetail,
    EnquiryEventOut,
    EnquiryFields,
    EnquiryListItem,
    EnquiryManualIn,
    EnquiryServiceOut,
    EnquiryUpdate,
)
from app.modules.services import repository as services_repo

ITEM_TYPE = "enquiry"
GENERIC_FAILURE = "We couldn't send that. Please try WhatsApp or call us."


def _snapshot(doc: Enquiry) -> dict:
    return {
        "status": doc.status,
        "assigned_to": str(doc.assigned_to) if doc.assigned_to else None,
        "not_proceeding_reason": doc.not_proceeding_reason,
    }


def to_list_item(doc: Enquiry) -> EnquiryListItem:
    return EnquiryListItem(
        id=str(doc.id),
        reference=doc.reference,
        name=doc.name,
        phone_e164=doc.phone_e164,
        services=[
            EnquiryServiceOut(service_id=str(s.service_id), name=s.name_snapshot)
            for s in doc.services
        ],
        area=doc.area,
        status=doc.status,
        source=doc.source,
        assigned_to=str(doc.assigned_to) if doc.assigned_to else None,
        created_at=doc.created_at,
    )


def to_detail(doc: Enquiry) -> EnquiryDetail:
    return EnquiryDetail(
        **to_list_item(doc).model_dump(),
        phone_raw=doc.phone_raw,
        relationship=doc.relationship,
        preferred_start=doc.preferred_start,
        note=doc.note,
        not_proceeding_reason=doc.not_proceeding_reason,
        consent=doc.consent,
        language=doc.language,
        first_contacted_at=doc.first_contacted_at,
        closed_at=doc.closed_at,
        events=[EnquiryEventOut(**e.model_dump()) for e in doc.events],
    )


async def _resolve_services(ids: list[str], lang: str) -> tuple[list[EnquiryService], list[str]]:
    """Snapshots are English (staff read them); the second list is in the visitor's language."""
    oids = [PydanticObjectId(i) for i in ids]
    found = {s.id: s for s in await services_repo.get_many_published(oids)}
    if len(found) != len(oids):
        raise ValidationFailed(
            "Choose the care you need from the list.", {"service_ids": "not available"}
        )
    snapshots = [
        EnquiryService(service_id=i, name_snapshot=resolve(found[i].name, DEFAULT_LANG))
        for i in oids
    ]
    return snapshots, [resolve(found[i].name, lang) for i in oids]


async def _insert(
    body: EnquiryFields, source: str, lang: str = DEFAULT_LANG, **extra
) -> tuple[Enquiry, list[str]]:
    phone = normalise_e164(body.phone)
    if phone is None:  # the schema already checked; keep the invariant here too
        raise ValidationFailed("Enter a valid Uganda phone number.", {"phone": "invalid"})
    services, lang_names = await _resolve_services(body.service_ids, lang)
    seq = await repo.next_sequence()
    doc = Enquiry(
        reference=rules.format_reference(seq),
        name=body.name,
        phone_raw=body.phone,
        phone_e164=phone,
        relationship=body.relationship,
        services=services,
        area=body.area,
        preferred_start=body.preferred_start,
        note=body.note,
        source=source,
        **extra,
    )
    try:
        await doc.insert()
    except DuplicateKeyError as exc:  # unique index on reference; a retry gets the next number
        raise Conflict("Please try again.") from exc
    return doc, lang_names


async def create_public(
    body: EnquiryCreate, lang: str, ip_hash: str, user_agent: str | None
) -> tuple[EnquiryCreated, str]:
    """Returns the reply and the new id (the router queues notifications with it).

    Checks run cheapest first: honeypot before any database read.
    """
    if body.website.strip():
        raise ValidationFailed(GENERIC_FAILURE)
    now = datetime.now(UTC)
    doc, names = await _insert(
        body,
        "form",
        lang,
        consent=True,
        consent_at=now,
        language=lang,
        ip_hash=ip_hash,
        user_agent=(user_agent or "")[:200] or None,
        events=[EnquiryEvent(kind="received", text="Request received from the website form")],
    )
    settings = get_settings()
    message = rules.whatsapp_message(
        settings.forms_whatsapp_prefix, names, doc.name, doc.area, doc.reference
    )
    created = EnquiryCreated(
        reference=doc.reference,
        whatsapp_url=rules.whatsapp_url(settings.business_whatsapp, message),
    )
    return created, str(doc.id)


async def create_manual(
    principal: Principal, body: EnquiryManualIn, ip_hash: str | None
) -> EnquiryDetail:
    doc, _ = await _insert(
        body,
        "manual",
        events=[EnquiryEvent(kind="received", user_id=principal.user_id, text="Entered by staff")],
    )
    await audit.record(
        principal, "enquiry.create", ITEM_TYPE, str(doc.id), doc.reference, ip_hash=ip_hash
    )
    return to_detail(doc)


async def list_admin(
    page: PageParams,
    q: str | None,
    status: str | None,
    service: str | None,
    assigned_to: str | None,
    start: datetime | None,
    end: datetime | None,
    oldest_first: bool,
) -> Page[EnquiryListItem]:
    items, total = await repo.list_admin(
        page, q, status, service, assigned_to, start, end, oldest_first
    )
    return Page(
        items=[to_list_item(i) for i in items],
        total=total,
        page=page.page,
        page_size=page.page_size,
    )


async def get_admin(enquiry_id: str) -> EnquiryDetail:
    doc = await repo.get(enquiry_id)
    if doc is None:
        raise NotFound("Enquiry not found.")
    return to_detail(doc)


async def update(
    principal: Principal, enquiry_id: str, body: EnquiryUpdate, ip_hash: str | None
) -> EnquiryDetail:
    doc = await repo.get(enquiry_id)
    if doc is None:
        raise NotFound("Enquiry not found.")
    before = _snapshot(doc)
    fields: dict = {}
    events: list[EnquiryEvent] = []
    now = datetime.now(UTC)
    sent = body.model_fields_set

    if "status" in sent and body.status is not None and body.status != doc.status:
        if not rules.can_transition(doc.status, body.status):
            raise ValidationFailed(
                f"A {doc.status.replace('_', ' ')} enquiry cannot be set to "
                f"{body.status.replace('_', ' ')}.",
                {"status": "not allowed"},
            )
        reason = (body.reason or "").strip()
        if body.status == "not_proceeding" and not reason:
            raise ValidationFailed("Please say why.", {"reason": "required"})
        fields["status"] = body.status
        fields["not_proceeding_reason"] = reason if body.status == "not_proceeding" else None
        if doc.first_contacted_at is None and doc.status == "new":
            fields["first_contacted_at"] = now
        fields["closed_at"] = now if body.status in rules.CLOSING else None
        events.append(
            EnquiryEvent(
                kind="status_change",
                user_id=principal.user_id,
                data={"from": doc.status, "to": body.status},
                text=reason,
            )
        )

    if "assigned_to" in sent:
        target = None
        if body.assigned_to is not None:
            user = (
                await User.get(PydanticObjectId(body.assigned_to))
                if PydanticObjectId.is_valid(body.assigned_to)
                else None
            )
            if user is None or not user.is_active:
                raise ValidationFailed("Choose an active team member.", {"assigned_to": "invalid"})
            target = user.id
        if target != doc.assigned_to:
            fields["assigned_to"] = target
            events.append(
                EnquiryEvent(
                    kind="assignment",
                    user_id=principal.user_id,
                    data={"to": str(target) if target else None},
                )
            )

    if fields:
        await repo.set_fields(doc.id, fields)
        for event in events:
            await repo.push_event(doc.id, event)
        fresh = await repo.get(enquiry_id)
        assert fresh is not None  # noqa: S101
        await audit.record(
            principal,
            "enquiry.update",
            ITEM_TYPE,
            str(doc.id),
            doc.reference,
            before=before,
            after=_snapshot(fresh),
            ip_hash=ip_hash,
        )
        return to_detail(fresh)
    return to_detail(doc)


async def add_note(
    principal: Principal, enquiry_id: str, text: str, ip_hash: str | None
) -> EnquiryDetail:
    doc = await repo.get(enquiry_id)
    if doc is None:
        raise NotFound("Enquiry not found.")
    await repo.push_event(doc.id, EnquiryEvent(kind="note", user_id=principal.user_id, text=text))
    await audit.record(
        principal, "enquiry.note", ITEM_TYPE, str(doc.id), doc.reference, ip_hash=ip_hash
    )
    fresh = await repo.get(enquiry_id)
    assert fresh is not None  # noqa: S101
    return to_detail(fresh)
