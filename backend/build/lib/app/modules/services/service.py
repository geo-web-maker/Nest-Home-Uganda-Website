"""Business rules for services. Audit and version calls live here, not in the router."""

from datetime import UTC, datetime
from typing import Any

from beanie import PydanticObjectId
from pymongo.errors import DuplicateKeyError

from app.core.deps import Principal
from app.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.core.i18n import resolve
from app.core.pagination import Page, PageParams
from app.modules.audit import service as audit
from app.modules.services import repository as repo
from app.modules.services.models import Service
from app.modules.services.schemas import (
    ServiceAdminOut,
    ServiceIn,
    ServicePublicCard,
    ServicePublicDetail,
    ServiceUpdate,
)

ITEM_TYPE = "service"
_SNAPSHOT_EXCLUDE = {"id", "revision_id"}
_REQUIRED_FIELDS = ("slug", "name", "number", "sort_order", "published")
_LIST_FIELDS = {"facts", "who_for", "includes", "related"}
_TEXT_FIELDS = {
    "summary", "hero_label", "hero_headline", "hero_lead", "how_often", "seo_title",
    "seo_description",
}  # fmt: skip


def _snapshot(doc: Service) -> dict[str, Any]:
    return doc.model_dump(mode="json", exclude=_SNAPSHOT_EXCLUDE)


def content_needed(doc: Service) -> bool:
    """True until the English detail copy exists (shown as a badge in admin)."""
    return not (
        doc.hero_headline.get("en")
        and doc.hero_lead.get("en")
        and doc.who_for
        and doc.includes
        and len(doc.facts) == 3
    )


def to_admin(doc: Service) -> ServiceAdminOut:
    data = doc.model_dump(exclude={"id", "revision_id", "deleted_at"})
    data["photo_media_id"] = str(doc.photo_media_id) if doc.photo_media_id else None
    data["related"] = [str(r) for r in doc.related]
    return ServiceAdminOut(id=str(doc.id), content_needed=content_needed(doc), **data)


def _card(doc: Service, lang: str) -> ServicePublicCard:
    return ServicePublicCard(
        id=str(doc.id),
        slug=doc.slug,
        name=resolve(doc.name, lang),
        summary=resolve(doc.summary, lang),
        number=doc.number,
        icon_key=doc.icon_key,
        photo_media_id=str(doc.photo_media_id) if doc.photo_media_id else None,
    )


async def _validate_related(related: list[str], own_id: PydanticObjectId | None) -> None:
    ids = [PydanticObjectId(r) for r in related]
    if own_id is not None and own_id in ids:
        raise ValidationFailed("A service cannot be related to itself.", {"related": "invalid"})
    if ids and await repo.count_live(ids) != len(ids):
        raise ValidationFailed("A related service does not exist.", {"related": "not found"})


def _require_publish(principal: Principal) -> None:
    if not principal.has("content:publish"):
        raise Forbidden("You can save drafts but not publish.")


# ---- admin ----


async def list_admin(
    page: PageParams, q: str | None, published: bool | None
) -> Page[ServiceAdminOut]:
    items, total = await repo.list_admin(page, q, published)
    return Page(
        items=[to_admin(i) for i in items],
        total=total,
        page=page.page,
        page_size=page.page_size,
    )


async def get_admin(service_id: str) -> ServiceAdminOut:
    doc = await repo.get(service_id)
    if doc is None:
        raise NotFound("Service not found.")
    return to_admin(doc)


async def create(principal: Principal, body: ServiceIn, ip_hash: str | None) -> ServiceAdminOut:
    if body.published:
        _require_publish(principal)
    if await repo.slug_taken(body.slug):
        raise Conflict("That page address is already used.", {"slug": "already used"})
    await _validate_related(body.related, None)
    data = body.model_dump()
    data["photo_media_id"] = PydanticObjectId(body.photo_media_id) if body.photo_media_id else None
    data["related"] = [PydanticObjectId(r) for r in body.related]
    doc = Service(**data)
    try:
        await doc.insert()
    except DuplicateKeyError as exc:
        raise Conflict("That page address is already used.", {"slug": "already used"}) from exc
    await audit.record(
        principal,
        "service.create",
        ITEM_TYPE,
        str(doc.id),
        doc.name.get("en"),
        after=_snapshot(doc),
        ip_hash=ip_hash,
    )
    return to_admin(doc)


async def update(
    principal: Principal, service_id: str, body: ServiceUpdate, ip_hash: str | None
) -> ServiceAdminOut:
    doc = await repo.get(service_id)
    if doc is None:
        raise NotFound("Service not found.")
    changes = body.model_dump(exclude_unset=True)
    if "published" in changes and changes["published"] != doc.published:
        _require_publish(principal)
    if "slug" in changes and changes["slug"] != doc.slug:
        if await repo.slug_taken(changes["slug"], doc.id):
            raise Conflict("That page address is already used.", {"slug": "already used"})
    if changes.get("related") is not None:
        await _validate_related(changes["related"], doc.id)
        changes["related"] = [PydanticObjectId(r) for r in changes["related"]]
    if "photo_media_id" in changes and changes["photo_media_id"]:
        changes["photo_media_id"] = PydanticObjectId(changes["photo_media_id"])
    # An explicit null clears an optional field. For required fields it is a mistake.
    for required in _REQUIRED_FIELDS:
        if required in changes and changes[required] is None:
            raise ValidationFailed("This field cannot be empty.", {required: "required"})
    before = _snapshot(doc)
    await audit.save_version(principal, ITEM_TYPE, str(doc.id), before)
    for key, value in changes.items():
        if value is None and key in _LIST_FIELDS:
            value = []
        elif value is None and key in _TEXT_FIELDS:
            value = {}
        setattr(doc, key, value)
    try:
        await doc.save()
    except DuplicateKeyError as exc:
        raise Conflict("That page address is already used.", {"slug": "already used"}) from exc
    await audit.record(
        principal,
        "service.update",
        ITEM_TYPE,
        str(doc.id),
        doc.name.get("en"),
        before=before,
        after=_snapshot(doc),
        ip_hash=ip_hash,
    )
    return to_admin(doc)


async def delete(principal: Principal, service_id: str, ip_hash: str | None) -> None:
    """Soft delete: the document stays, hidden everywhere, so it can be recovered."""
    doc = await repo.get(service_id)
    if doc is None:
        raise NotFound("Service not found.")
    before = _snapshot(doc)
    await audit.save_version(principal, ITEM_TYPE, str(doc.id), before)
    doc.deleted_at = datetime.now(UTC)
    doc.published = False
    await doc.save()
    await audit.record(
        principal,
        "service.delete",
        ITEM_TYPE,
        str(doc.id),
        doc.name.get("en"),
        before=before,
        ip_hash=ip_hash,
    )


# ---- public ----


async def public_list(lang: str) -> list[ServicePublicCard]:
    return [_card(d, lang) for d in await repo.list_published()]


async def public_detail(slug: str, lang: str) -> ServicePublicDetail:
    doc = await repo.get_published_by_slug(slug)
    if doc is None:
        raise NotFound("Service not found.")
    related_docs = await repo.get_many_published(doc.related) if doc.related else []
    by_id = {d.id: d for d in related_docs}
    related = [_card(by_id[i], lang) for i in doc.related if i in by_id]
    card = _card(doc, lang)
    return ServicePublicDetail(
        **card.model_dump(),
        hero_label=resolve(doc.hero_label, lang),
        hero_headline=resolve(doc.hero_headline, lang),
        hero_lead=resolve(doc.hero_lead, lang),
        facts=[resolve(f, lang) for f in doc.facts],
        who_for=[resolve(i, lang) for i in doc.who_for],
        includes=[resolve(i, lang) for i in doc.includes],
        how_often=resolve(doc.how_often, lang),
        seo_title=resolve(doc.seo_title, lang),
        seo_description=resolve(doc.seo_description, lang),
        related=related,
    )
