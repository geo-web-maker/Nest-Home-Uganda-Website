"""Business rules, audit logging and public text resolution."""

from datetime import UTC, datetime
from typing import Any

from app.core.deps import Principal
from app.core.errors import Forbidden, NotFound, ValidationFailed
from app.core.pagination import Page, PageParams
from app.modules.areas import repository as repo
from app.modules.areas.models import Area
from app.modules.areas.schemas import AreaAdminOut, AreaIn, AreaPublic, AreaUpdate
from app.modules.audit import service as audit

ITEM_TYPE = "area"
_REQUIRED = ("name", "sort_order")
_TEXT_FIELDS = set()


def _snapshot(doc: Area) -> dict[str, Any]:
    return doc.model_dump(mode="json", exclude={"id", "revision_id"})


def to_admin(doc: Area) -> AreaAdminOut:
    data = doc.model_dump(exclude={"id", "revision_id", "deleted_at"})
    return AreaAdminOut(id=str(doc.id), **data)


def _public(doc: Area, lang: str) -> AreaPublic:
    data: dict[str, Any] = {"id": str(doc.id)}
    data["name"] = doc.name
    data["sort_order"] = doc.sort_order
    data["aliases"] = doc.aliases
    return AreaPublic(**data)


def _require_publish(principal: Principal) -> None:
    if not principal.has("content:publish"):
        raise Forbidden("You can save drafts but not publish.")


async def list_admin(page: PageParams, q: str | None, active: bool | None) -> Page[AreaAdminOut]:
    items, total = await repo.list_admin(page, q, active)
    return Page(
        items=[to_admin(item) for item in items],
        total=total,
        page=page.page,
        page_size=page.page_size,
    )


async def get_admin(item_id: str) -> AreaAdminOut:
    doc = await repo.get(item_id)
    if doc is None:
        raise NotFound("Area not found.")
    return to_admin(doc)


async def create(principal: Principal, body: AreaIn, ip_hash: str | None) -> AreaAdminOut:
    data = body.model_dump()
    doc = Area(**data)
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
    principal: Principal, item_id: str, body: AreaUpdate, ip_hash: str | None
) -> AreaAdminOut:
    doc = await repo.get(item_id)
    if doc is None:
        raise NotFound("Area not found.")
    changes = body.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] is None:
        raise ValidationFailed("This field cannot be empty.", {"name": "required"})
    if "sort_order" in changes and changes["sort_order"] is None:
        raise ValidationFailed("This field cannot be empty.", {"sort_order": "required"})
    before = _snapshot(doc)
    await audit.save_version(principal, ITEM_TYPE, str(doc.id), before)
    for key, value in changes.items():
        if value is None and key in _TEXT_FIELDS:
            value = {}
        elif value is None and key in {"aliases"}:
            value = []
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
        raise NotFound("Area not found.")
    before = _snapshot(doc)
    await audit.save_version(principal, ITEM_TYPE, str(doc.id), before)
    doc.deleted_at = datetime.now(UTC)
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


def _label(doc: Area) -> str | None:
    value = getattr(doc, "name", None)
    if isinstance(value, dict):
        return value.get("en")
    return value


async def public_list(lang: str) -> list[AreaPublic]:
    docs = await repo.list_public()
    return [_public(doc, lang) for doc in docs]
