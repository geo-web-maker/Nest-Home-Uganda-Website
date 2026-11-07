"""Business rules, audit logging and public text resolution."""

from datetime import UTC, datetime
from typing import Any

from beanie import PydanticObjectId
from pymongo.errors import DuplicateKeyError

from app.core.deps import Principal
from app.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.core.i18n import resolve
from app.core.pagination import Page, PageParams
from app.modules.articles import repository as repo
from app.modules.articles.models import Article
from app.modules.articles.schemas import ArticleAdminOut, ArticleIn, ArticlePublic, ArticleUpdate
from app.modules.audit import service as audit

ITEM_TYPE = "article"
_REQUIRED = ("slug", "title")
_TEXT_FIELDS = {"title", "body"}


def _snapshot(doc: Article) -> dict[str, Any]:
    return doc.model_dump(mode="json", exclude={"id", "revision_id"})


def to_admin(doc: Article) -> ArticleAdminOut:
    data = doc.model_dump(exclude={"id", "revision_id", "deleted_at"})
    data["image_media_id"] = str(doc.image_media_id) if doc.image_media_id else None
    return ArticleAdminOut(id=str(doc.id), **data)


def _public(doc: Article, lang: str) -> ArticlePublic:
    data: dict[str, Any] = {"id": str(doc.id)}
    data["slug"] = doc.slug
    data["title"] = resolve(doc.title, lang)
    data["body"] = resolve(doc.body, lang)
    data["image_media_id"] = str(doc.image_media_id) if doc.image_media_id else None
    data["published_at"] = doc.published_at
    return ArticlePublic(**data)


def _require_publish(principal: Principal) -> None:
    if not principal.has("content:publish"):
        raise Forbidden("You can save drafts but not publish.")


async def list_admin(page: PageParams, q: str | None, active: bool | None) -> Page[ArticleAdminOut]:
    items, total = await repo.list_admin(page, q, active)
    return Page(
        items=[to_admin(item) for item in items],
        total=total,
        page=page.page,
        page_size=page.page_size,
    )


async def get_admin(item_id: str) -> ArticleAdminOut:
    doc = await repo.get(item_id)
    if doc is None:
        raise NotFound("Article not found.")
    return to_admin(doc)


async def create(principal: Principal, body: ArticleIn, ip_hash: str | None) -> ArticleAdminOut:
    if body.published_at is not None:
        _require_publish(principal)
    if await repo.unique_taken(body.slug):
        raise Conflict("That address is already used.", {"slug": "already used"})
    data = body.model_dump()
    data["image_media_id"] = PydanticObjectId(body.image_media_id) if body.image_media_id else None
    doc = Article(**data)
    try:
        await doc.insert()
    except DuplicateKeyError as exc:
        raise Conflict("That address is already used.", {"slug": "already used"}) from exc
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
    principal: Principal, item_id: str, body: ArticleUpdate, ip_hash: str | None
) -> ArticleAdminOut:
    doc = await repo.get(item_id)
    if doc is None:
        raise NotFound("Article not found.")
    changes = body.model_dump(exclude_unset=True)
    if "published_at" in changes and changes["published_at"] != doc.published_at:
        _require_publish(principal)
    if changes.get("slug") and changes["slug"] != doc.slug:
        if await repo.unique_taken(changes["slug"], doc.id):
            raise Conflict("That address is already used.", {"slug": "already used"})
    for required in _REQUIRED:
        if required in changes and changes[required] is None:
            raise ValidationFailed("This field cannot be empty.", {required: "required"})
    if "image_media_id" in changes and changes["image_media_id"]:
        changes["image_media_id"] = PydanticObjectId(changes["image_media_id"])
    before = _snapshot(doc)
    await audit.save_version(principal, ITEM_TYPE, str(doc.id), before)
    for key, value in changes.items():
        if value is None and key in _TEXT_FIELDS:
            value = {}
        setattr(doc, key, value)
    try:
        await doc.save()
    except DuplicateKeyError as exc:
        raise Conflict("That address is already used.", {"slug": "already used"}) from exc
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
        raise NotFound("Article not found.")
    before = _snapshot(doc)
    await audit.save_version(principal, ITEM_TYPE, str(doc.id), before)
    doc.deleted_at = datetime.now(UTC)
    doc.published_at = None
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


def _label(doc: Article) -> str | None:
    value = getattr(doc, "slug", None)
    if isinstance(value, dict):
        return value.get("en")
    return value


async def public_list(lang: str) -> list[ArticlePublic]:
    docs = await repo.list_public()
    return [_public(doc, lang) for doc in docs]


async def public_detail(slug: str, lang: str) -> ArticlePublic:
    doc = await repo.get_public_by_slug(slug)
    if doc is None:
        raise NotFound("Article not found.")
    return _public(doc, lang)
