"""Team member business rules, audit records and content versions."""

from datetime import UTC, datetime
from typing import Any

from beanie import PydanticObjectId

from app.core.deps import Principal
from app.core.errors import Forbidden, NotFound, ValidationFailed
from app.core.i18n import resolve
from app.core.pagination import Page, PageParams
from app.modules.audit import service as audit
from app.modules.team import repository as repo
from app.modules.team.models import TeamMember
from app.modules.team.schemas import (
    TeamMemberAdminOut,
    TeamMemberIn,
    TeamMemberPublic,
    TeamMemberUpdate,
)

ITEM_TYPE = "team_member"
_REQUIRED_FIELDS = {
    "name",
    "role",
    "qualification",
    "sort_order",
    "published",
}
_TEXT_FIELDS = {"role", "qualification", "bio"}


def _snapshot(doc: TeamMember) -> dict[str, Any]:
    return doc.model_dump(mode="json", exclude={"id", "revision_id"})


def _require_publish(principal: Principal) -> None:
    if not principal.has("content:publish"):
        raise Forbidden("You can save drafts but not publish.")


def to_admin(doc: TeamMember) -> TeamMemberAdminOut:
    data = doc.model_dump(exclude={"id", "revision_id", "deleted_at"})
    data["photo_media_id"] = str(doc.photo_media_id) if doc.photo_media_id else None
    return TeamMemberAdminOut(id=str(doc.id), **data)


def _to_public(doc: TeamMember, lang: str) -> TeamMemberPublic:
    return TeamMemberPublic(
        id=str(doc.id),
        name=doc.name,
        role=resolve(doc.role, lang),
        qualification=resolve(doc.qualification, lang),
        photo_media_id=(str(doc.photo_media_id) if doc.photo_media_id else None),
    )


async def list_admin(
    page: PageParams,
    q: str | None,
    published: bool | None,
) -> Page[TeamMemberAdminOut]:
    items, total = await repo.list_admin(page, q, published)
    return Page(
        items=[to_admin(item) for item in items],
        total=total,
        page=page.page,
        page_size=page.page_size,
    )


async def get_admin(member_id: str) -> TeamMemberAdminOut:
    doc = await repo.get(member_id)
    if doc is None:
        raise NotFound("Team member not found.")
    return to_admin(doc)


async def create(
    principal: Principal,
    body: TeamMemberIn,
    ip_hash: str | None,
) -> TeamMemberAdminOut:
    if body.published:
        _require_publish(principal)

    data = body.model_dump()
    data["photo_media_id"] = PydanticObjectId(body.photo_media_id) if body.photo_media_id else None

    doc = TeamMember(**data)
    await doc.insert()

    await audit.record(
        principal,
        "team_member.create",
        ITEM_TYPE,
        str(doc.id),
        doc.name,
        after=_snapshot(doc),
        ip_hash=ip_hash,
    )
    return to_admin(doc)


async def update(
    principal: Principal,
    member_id: str,
    body: TeamMemberUpdate,
    ip_hash: str | None,
) -> TeamMemberAdminOut:
    doc = await repo.get(member_id)
    if doc is None:
        raise NotFound("Team member not found.")

    changes = body.model_dump(exclude_unset=True)

    if "published" in changes and changes["published"] != doc.published:
        _require_publish(principal)

    for field in _REQUIRED_FIELDS:
        if field in changes and changes[field] is None:
            raise ValidationFailed(
                "This field cannot be empty.",
                {field: "required"},
            )

    if "photo_media_id" in changes and changes["photo_media_id"]:
        changes["photo_media_id"] = PydanticObjectId(changes["photo_media_id"])

    before = _snapshot(doc)
    await audit.save_version(
        principal,
        ITEM_TYPE,
        str(doc.id),
        before,
    )

    for key, value in changes.items():
        if value is None and key in _TEXT_FIELDS:
            value = {}
        setattr(doc, key, value)

    await doc.save()

    await audit.record(
        principal,
        "team_member.update",
        ITEM_TYPE,
        str(doc.id),
        doc.name,
        before=before,
        after=_snapshot(doc),
        ip_hash=ip_hash,
    )
    return to_admin(doc)


async def delete(
    principal: Principal,
    member_id: str,
    ip_hash: str | None,
) -> None:
    doc = await repo.get(member_id)
    if doc is None:
        raise NotFound("Team member not found.")

    before = _snapshot(doc)
    await audit.save_version(
        principal,
        ITEM_TYPE,
        str(doc.id),
        before,
    )

    doc.deleted_at = datetime.now(UTC)
    doc.published = False
    await doc.save()

    await audit.record(
        principal,
        "team_member.delete",
        ITEM_TYPE,
        str(doc.id),
        doc.name,
        before=before,
        ip_hash=ip_hash,
    )


async def public_list(lang: str) -> list[TeamMemberPublic]:
    members = await repo.list_published()
    return [_to_public(member, lang) for member in members]
