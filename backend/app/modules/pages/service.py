"""Business rules, audit logging and public text resolution."""

from datetime import UTC, datetime
from typing import Any

from pymongo.errors import DuplicateKeyError

from app.core.deps import Principal
from app.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.core.i18n import resolve
from app.core.pagination import Page, PageParams
from app.modules.audit import service as audit
from app.modules.pages import repository as repo
from app.modules.pages.models import ContentPage
from app.modules.pages.schemas import (
    ContentPageAdminOut,
    ContentPageIn,
    ContentPagePublic,
    ContentPageUpdate,
)

ITEM_TYPE = "page"
_REQUIRED = ("key", "title", "published")
_TEXT_FIELDS = {"title", "body"}


def _snapshot(doc: ContentPage) -> dict[str, Any]:
    return doc.model_dump(mode="json", exclude={"id", "revision_id"})


def to_admin(doc: ContentPage) -> ContentPageAdminOut:
    data = doc.model_dump(exclude={"id", "revision_id", "deleted_at"})
    return ContentPageAdminOut(id=str(doc.id), **data)


def _public(doc: ContentPage, lang: str) -> ContentPagePublic:
    data: dict[str, Any] = {"id": str(doc.id)}
    data["key"] = doc.key
    data["title"] = resolve(doc.title, lang)
    data["body"] = resolve(doc.body, lang)
    return ContentPagePublic(**data)


def _require_publish(principal: Principal) -> None:
    if not principal.has("content:publish"):
        raise Forbidden("You can save drafts but not publish.")


async def list_admin(
    page: PageParams, q: str | None, active: bool | None
) -> Page[ContentPageAdminOut]:
    items, total = await repo.list_admin(page, q, active)
    return Page(
        items=[to_admin(item) for item in items],
        total=total,
        page=page.page,
        page_size=page.page_size,
    )


async def get_admin(item_id: str) -> ContentPageAdminOut:
    doc = await repo.get(item_id)
    if doc is None:
        raise NotFound("Page not found.")
    return to_admin(doc)


async def create(
    principal: Principal, body: ContentPageIn, ip_hash: str | None
) -> ContentPageAdminOut:
    if body.published:
        _require_publish(principal)
    if await repo.unique_taken(body.key):
        raise Conflict("That address is already used.", {"key": "already used"})
    data = body.model_dump()
    doc = ContentPage(**data)
    try:
        await doc.insert()
    except DuplicateKeyError as exc:
        raise Conflict("That address is already used.", {"key": "already used"}) from exc
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
    principal: Principal, item_id: str, body: ContentPageUpdate, ip_hash: str | None
) -> ContentPageAdminOut:
    doc = await repo.get(item_id)
    if doc is None:
        raise NotFound("Page not found.")
    changes = body.model_dump(exclude_unset=True)
    if "published" in changes and changes["published"] != doc.published:
        _require_publish(principal)
    if changes.get("key") and changes["key"] != doc.key:
        if await repo.unique_taken(changes["key"], doc.id):
            raise Conflict("That address is already used.", {"key": "already used"})
    for required in _REQUIRED:
        if required in changes and changes[required] is None:
            raise ValidationFailed("This field cannot be empty.", {required: "required"})
    before = _snapshot(doc)
    await audit.save_version(principal, ITEM_TYPE, str(doc.id), before)
    for key, value in changes.items():
        if value is None and key in _TEXT_FIELDS:
            value = {}
        setattr(doc, key, value)
    try:
        await doc.save()
    except DuplicateKeyError as exc:
        raise Conflict("That address is already used.", {"key": "already used"}) from exc
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
        raise NotFound("Page not found.")
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


def _label(doc: ContentPage) -> str | None:
    value = getattr(doc, "key", None)
    if isinstance(value, dict):
        return value.get("en")
    return value


async def public_list(lang: str) -> list[ContentPagePublic]:
    docs = await repo.list_public()
    return [_public(doc, lang) for doc in docs]


async def public_detail(key: str, lang: str) -> ContentPagePublic:
    doc = await repo.get_public_by_key(key)
    if doc is None:
        raise NotFound("Page not found.")
    return _public(doc, lang)
