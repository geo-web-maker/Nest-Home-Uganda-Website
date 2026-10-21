"""Business rules, audit logging and public text resolution."""

from datetime import UTC, datetime
from typing import Any

from app.core.deps import Principal
from app.core.errors import Forbidden, NotFound, ValidationFailed
from app.core.i18n import resolve
from app.core.pagination import Page, PageParams
from app.modules.audit import service as audit
from app.modules.testimonials import repository as repo
from app.modules.testimonials.models import Testimonial
from app.modules.testimonials.schemas import (
    TestimonialAdminOut,
    TestimonialIn,
    TestimonialPublic,
    TestimonialUpdate,
)

ITEM_TYPE = "testimonial"
_REQUIRED = ("first_name", "area", "quote", "permission_received", "approved")
_TEXT_FIELDS = {"quote"}


def _snapshot(doc: Testimonial) -> dict[str, Any]:
    return doc.model_dump(mode="json", exclude={"id", "revision_id"})


def to_admin(doc: Testimonial) -> TestimonialAdminOut:
    data = doc.model_dump(exclude={"id", "revision_id", "deleted_at"})
    return TestimonialAdminOut(id=str(doc.id), **data)


def _public(doc: Testimonial, lang: str) -> TestimonialPublic:
    data: dict[str, Any] = {"id": str(doc.id)}
    data["first_name"] = doc.first_name
    data["area"] = doc.area
    data["quote"] = resolve(doc.quote, lang)
    return TestimonialPublic(**data)


def _require_permission(approved: bool, permission_received: bool) -> None:
    """Spec 7.6: written permission is required before a testimonial can be approved."""
    if approved and not permission_received:
        raise ValidationFailed(
            "Written permission is needed before a testimonial can be approved.",
            {"approved": "permission needed"},
        )


def _require_publish(principal: Principal) -> None:
    if not principal.has("content:publish"):
        raise Forbidden("You can save drafts but not publish.")


async def list_admin(
    page: PageParams, q: str | None, active: bool | None
) -> Page[TestimonialAdminOut]:
    items, total = await repo.list_admin(page, q, active)
    return Page(
        items=[to_admin(item) for item in items],
        total=total,
        page=page.page,
        page_size=page.page_size,
    )


async def get_admin(item_id: str) -> TestimonialAdminOut:
    doc = await repo.get(item_id)
    if doc is None:
        raise NotFound("Testimonial not found.")
    return to_admin(doc)


async def create(
    principal: Principal, body: TestimonialIn, ip_hash: str | None
) -> TestimonialAdminOut:
    if body.approved:
        _require_publish(principal)
    _require_permission(body.approved, body.permission_received)
    data = body.model_dump()
    doc = Testimonial(**data)
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
    principal: Principal, item_id: str, body: TestimonialUpdate, ip_hash: str | None
) -> TestimonialAdminOut:
    doc = await repo.get(item_id)
    if doc is None:
        raise NotFound("Testimonial not found.")
    changes = body.model_dump(exclude_unset=True)
    if "approved" in changes and changes["approved"] != doc.approved:
        _require_publish(principal)
    if "first_name" in changes and changes["first_name"] is None:
        raise ValidationFailed("This field cannot be empty.", {"first_name": "required"})
    if "area" in changes and changes["area"] is None:
        raise ValidationFailed("This field cannot be empty.", {"area": "required"})
    if "quote" in changes and changes["quote"] is None:
        raise ValidationFailed("This field cannot be empty.", {"quote": "required"})
    if "permission_received" in changes and changes["permission_received"] is None:
        raise ValidationFailed("This field cannot be empty.", {"permission_received": "required"})
    if "approved" in changes and changes["approved"] is None:
        raise ValidationFailed("This field cannot be empty.", {"approved": "required"})
    _require_permission(
        changes.get("approved", doc.approved),
        changes.get("permission_received", doc.permission_received),
    )
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
        raise NotFound("Testimonial not found.")
    before = _snapshot(doc)
    await audit.save_version(principal, ITEM_TYPE, str(doc.id), before)
    doc.deleted_at = datetime.now(UTC)
    doc.approved = False
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


def _label(doc: Testimonial) -> str | None:
    value = getattr(doc, "first_name", None)
    if isinstance(value, dict):
        return value.get("en")
    return value


async def public_list(lang: str) -> list[TestimonialPublic]:
    docs = await repo.list_public()
    return [_public(doc, lang) for doc in docs]
