"""Business rules, audit logging and public text resolution."""

from datetime import UTC, datetime
from typing import Any

from pymongo.errors import DuplicateKeyError

from app.core.deps import Principal
from app.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.core.i18n import resolve
from app.core.pagination import Page, PageParams
from app.modules.audit import service as audit
from app.modules.pricing import repository as repo
from app.modules.pricing.models import PricingBlock
from app.modules.pricing.schemas import (
    PricingBlockAdminOut,
    PricingBlockIn,
    PricingBlockPublic,
    PricingBlockUpdate,
)

ITEM_TYPE = "pricing"
_REQUIRED = ("key", "title", "show", "sort_order")
_TEXT_FIELDS = {"title", "tag", "text", "price_text"}


def _snapshot(doc: PricingBlock) -> dict[str, Any]:
    return doc.model_dump(mode="json", exclude={"id", "revision_id"})


def to_admin(doc: PricingBlock) -> PricingBlockAdminOut:
    data = doc.model_dump(exclude={"id", "revision_id", "deleted_at"})
    return PricingBlockAdminOut(id=str(doc.id), **data)


def _public(doc: PricingBlock, lang: str) -> PricingBlockPublic:
    data: dict[str, Any] = {"id": str(doc.id)}
    data["key"] = doc.key
    data["tag"] = resolve(doc.tag, lang)
    data["title"] = resolve(doc.title, lang)
    data["text"] = resolve(doc.text, lang)
    data["price_text"] = resolve(doc.price_text, lang)
    data["sort_order"] = doc.sort_order
    return PricingBlockPublic(**data)


def _require_publish(principal: Principal) -> None:
    if not principal.has("content:publish"):
        raise Forbidden("You can save drafts but not publish.")


async def list_admin(
    page: PageParams, q: str | None, active: bool | None
) -> Page[PricingBlockAdminOut]:
    items, total = await repo.list_admin(page, q, active)
    return Page(
        items=[to_admin(item) for item in items],
        total=total,
        page=page.page,
        page_size=page.page_size,
    )


async def get_admin(item_id: str) -> PricingBlockAdminOut:
    doc = await repo.get(item_id)
    if doc is None:
        raise NotFound("PricingBlock not found.")
    return to_admin(doc)


async def create(
    principal: Principal, body: PricingBlockIn, ip_hash: str | None
) -> PricingBlockAdminOut:
    if body.show:
        _require_publish(principal)
    if await repo.key_taken(body.key):
        raise Conflict("That card already exists.", {"key": "already used"})
    data = body.model_dump()
    doc = PricingBlock(**data)
    try:
        await doc.insert()
    except DuplicateKeyError as exc:
        raise Conflict("That card already exists.", {"key": "already used"}) from exc
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
    principal: Principal, item_id: str, body: PricingBlockUpdate, ip_hash: str | None
) -> PricingBlockAdminOut:
    doc = await repo.get(item_id)
    if doc is None:
        raise NotFound("PricingBlock not found.")
    changes = body.model_dump(exclude_unset=True)
    if "show" in changes and changes["show"] != doc.show:
        _require_publish(principal)
    if "key" in changes and changes["key"] is None:
        raise ValidationFailed("This field cannot be empty.", {"key": "required"})
    if "title" in changes and changes["title"] is None:
        raise ValidationFailed("This field cannot be empty.", {"title": "required"})
    if "show" in changes and changes["show"] is None:
        raise ValidationFailed("This field cannot be empty.", {"show": "required"})
    if "sort_order" in changes and changes["sort_order"] is None:
        raise ValidationFailed("This field cannot be empty.", {"sort_order": "required"})
    if (
        changes.get("key")
        and changes["key"] != doc.key
        and await repo.key_taken(changes["key"], doc.id)
    ):
        raise Conflict("That card already exists.", {"key": "already used"})
    before = _snapshot(doc)
    await audit.save_version(principal, ITEM_TYPE, str(doc.id), before)
    for key, value in changes.items():
        if value is None and key in _TEXT_FIELDS:
            value = {}
        setattr(doc, key, value)
    try:
        await doc.save()
    except DuplicateKeyError as exc:
        raise Conflict("That card already exists.", {"key": "already used"}) from exc
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
        raise NotFound("PricingBlock not found.")
    before = _snapshot(doc)
    await audit.save_version(principal, ITEM_TYPE, str(doc.id), before)
    doc.deleted_at = datetime.now(UTC)
    doc.show = False
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


def _label(doc: PricingBlock) -> str | None:
    value = getattr(doc, "key", None)
    if isinstance(value, dict):
        return value.get("en")
    return value


async def public_list(lang: str) -> list[PricingBlockPublic]:
    docs = await repo.list_public()
    return [_public(doc, lang) for doc in docs]
