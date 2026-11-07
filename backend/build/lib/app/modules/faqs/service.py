"""Business rules, audit logging and public text resolution."""

from datetime import UTC, datetime
from typing import Any

from beanie import PydanticObjectId

from app.core.deps import Principal
from app.core.errors import Forbidden, NotFound, ValidationFailed
from app.core.i18n import resolve
from app.core.pagination import Page, PageParams
from app.modules.audit import service as audit
from app.modules.faqs import repository as repo
from app.modules.faqs.models import Faq
from app.modules.faqs.schemas import FaqAdminOut, FaqIn, FaqPublic, FaqUpdate

ITEM_TYPE = "faq"
_REQUIRED = ("question", "answer", "sort_order", "published")
_TEXT_FIELDS = {"answer", "question"}


def _snapshot(doc: Faq) -> dict[str, Any]:
    return doc.model_dump(mode="json", exclude={"id", "revision_id"})


def to_admin(doc: Faq) -> FaqAdminOut:
    data = doc.model_dump(exclude={"id", "revision_id", "deleted_at"})
    data["service_id"] = str(doc.service_id) if doc.service_id else None
    return FaqAdminOut(id=str(doc.id), **data)


def _public(doc: Faq, lang: str) -> FaqPublic:
    data: dict[str, Any] = {"id": str(doc.id)}
    data["question"] = resolve(doc.question, lang)
    data["answer"] = resolve(doc.answer, lang)
    data["service_id"] = str(doc.service_id) if doc.service_id else None
    data["sort_order"] = doc.sort_order
    return FaqPublic(**data)


def _require_publish(principal: Principal) -> None:
    if not principal.has("content:publish"):
        raise Forbidden("You can save drafts but not publish.")


async def list_admin(page: PageParams, q: str | None, active: bool | None) -> Page[FaqAdminOut]:
    items, total = await repo.list_admin(page, q, active)
    return Page(
        items=[to_admin(item) for item in items],
        total=total,
        page=page.page,
        page_size=page.page_size,
    )


async def get_admin(item_id: str) -> FaqAdminOut:
    doc = await repo.get(item_id)
    if doc is None:
        raise NotFound("Faq not found.")
    return to_admin(doc)


async def create(principal: Principal, body: FaqIn, ip_hash: str | None) -> FaqAdminOut:
    if body.published:
        _require_publish(principal)
    data = body.model_dump()
    data["service_id"] = PydanticObjectId(body.service_id) if body.service_id else None
    doc = Faq(**data)
    await doc.insert()
    await audit.record(
        principal,
        f"{ITEM_TYPE}.create",
        ITEM_TYPE,
        str(doc.id),
        _label(doc),
        after=_snapshot(doc),
        ip_hash=ip_hash,
    )
    return to_admin(doc)


async def update(
    principal: Principal, item_id: str, body: FaqUpdate, ip_hash: str | None
) -> FaqAdminOut:
    doc = await repo.get(item_id)
    if doc is None:
        raise NotFound("Faq not found.")
    changes = body.model_dump(exclude_unset=True)
    if "published" in changes and changes["published"] != doc.published:
        _require_publish(principal)
    if "question" in changes and changes["question"] is None:
        raise ValidationFailed("This field cannot be empty.", {"question": "required"})
    if "answer" in changes and changes["answer"] is None:
        raise ValidationFailed("This field cannot be empty.", {"answer": "required"})
    if "sort_order" in changes and changes["sort_order"] is None:
        raise ValidationFailed("This field cannot be empty.", {"sort_order": "required"})
    if "published" in changes and changes["published"] is None:
        raise ValidationFailed("This field cannot be empty.", {"published": "required"})
    if "service_id" in changes and changes["service_id"]:
        changes["service_id"] = PydanticObjectId(changes["service_id"])
    before = _snapshot(doc)
    await audit.save_version(principal, ITEM_TYPE, str(doc.id), before)
    for key, value in changes.items():
        if value is None and key in _TEXT_FIELDS:
            value = {}
        setattr(doc, key, value)
    await doc.save()
    await audit.record(
        principal,
        f"{ITEM_TYPE}.update",
        ITEM_TYPE,
        str(doc.id),
        _label(doc),
        before=before,
        after=_snapshot(doc),
        ip_hash=ip_hash,
    )
    return to_admin(doc)


async def delete(principal: Principal, item_id: str, ip_hash: str | None) -> None:
    doc = await repo.get(item_id)
    if doc is None:
        raise NotFound("Faq not found.")
    before = _snapshot(doc)
    await audit.save_version(principal, ITEM_TYPE, str(doc.id), before)
    doc.deleted_at = datetime.now(UTC)
    doc.published = False
    await doc.save()
    await audit.record(
        principal,
        f"{ITEM_TYPE}.delete",
        ITEM_TYPE,
        str(doc.id),
        _label(doc),
        before=before,
        ip_hash=ip_hash,
    )


def _label(doc: Faq) -> str | None:
    value = getattr(doc, "question", None)
    if isinstance(value, dict):
        return value.get("en")
    return value


async def public_list(lang: str) -> list[FaqPublic]:
    docs = await repo.list_public()
    return [_public(doc, lang) for doc in docs]
