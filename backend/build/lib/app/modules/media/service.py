"""Media metadata rules. Object writes use the shared StorageService interface."""

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from beanie import PydanticObjectId

from app.core.deps import Principal
from app.core.errors import NotFound, ValidationFailed
from app.core.i18n import resolve
from app.core.pagination import Page, PageParams
from app.core.storage import Bucket, get_storage
from app.modules.audit import service as audit
from app.modules.media import repository as repo
from app.modules.media.models import Media
from app.modules.media.schemas import MediaAdminOut, MediaPublic, MediaUpdate

ITEM_TYPE = "media"


def _snapshot(doc: Media) -> dict[str, Any]:
    return doc.model_dump(mode="json", exclude={"id", "revision_id"})


def to_admin(doc: Media) -> MediaAdminOut:
    data = doc.model_dump(exclude={"id", "revision_id", "deleted_at"})
    data["uploaded_by"] = str(doc.uploaded_by) if doc.uploaded_by else None
    return MediaAdminOut(id=str(doc.id), **data)


def to_public(doc: Media, lang: str) -> MediaPublic:
    return MediaPublic(
        id=str(doc.id),
        public_url=doc.public_url,
        variants=doc.variants,
        alt_text=resolve(doc.alt_text, lang),
        mime=doc.mime,
        width=doc.width,
        height=doc.height,
    )


async def list_admin(page: PageParams, q: str | None) -> Page[MediaAdminOut]:
    items, total = await repo.list_admin(page, q)
    return Page(
        items=[to_admin(item) for item in items],
        total=total,
        page=page.page,
        page_size=page.page_size,
    )


MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # spec 7.6: max 10 MB
# Detected from the file's own bytes. The client's content type and file name are never trusted.
# SVG is not accepted yet: it can carry scripts and needs a sanitiser first.
_SIGNATURES: tuple[tuple[bytes, str, str], ...] = (
    (b"\xff\xd8\xff", "image/jpeg", "jpg"),
    (b"\x89PNG\r\n\x1a\n", "image/png", "png"),
)


def detect_image_type(data: bytes) -> tuple[str, str] | None:
    """Return (mime, extension) from magic bytes, or None if the file is not an allowed image."""
    for signature, mime, extension in _SIGNATURES:
        if data.startswith(signature):
            return mime, extension
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    return None


async def create(
    principal: Principal, data: bytes, alt_text: dict[str, str], ip_hash: str | None
) -> MediaAdminOut:
    """Validate and store one image, then record its metadata.

    TODO(claude): safe image decoding, width and height, responsive variants (480, 800, 1280)
    and the public URL. They need an image library that is not pinned yet.
    """
    if not data:
        raise ValidationFailed("Choose an image to upload.", {"file": "required"})
    if len(data) > MAX_UPLOAD_BYTES:
        raise ValidationFailed("The image must be 10 MB or smaller.", {"file": "too large"})
    detected = detect_image_type(data)
    if detected is None:
        raise ValidationFailed("Upload a JPG, PNG or WebP image.", {"file": "wrong type"})
    mime, extension = detected
    key = f"media/{uuid4().hex}.{extension}"
    await get_storage().put(Bucket.PUBLIC, key, data, mime)
    uploader = principal.user_id if PydanticObjectId.is_valid(principal.user_id) else None
    doc = Media(
        storage_key=key,
        public_url="",  # TODO(claude): build from the public bucket configuration.
        mime=mime,
        size_bytes=len(data),
        alt_text=alt_text,
        uploaded_by=PydanticObjectId(uploader) if uploader else None,
    )
    try:
        await doc.insert()
    except Exception:
        await get_storage().delete(Bucket.PUBLIC, key)  # no orphan object without a record
        raise
    await audit.record(
        principal,
        "media.create",
        ITEM_TYPE,
        str(doc.id),
        key,
        after=_snapshot(doc),
        ip_hash=ip_hash,
    )
    return to_admin(doc)


async def update(
    principal: Principal, media_id: str, body: MediaUpdate, ip_hash: str | None
) -> MediaAdminOut:
    doc = await repo.get(media_id)
    if doc is None:
        raise NotFound("Media not found.")
    before = _snapshot(doc)
    await audit.save_version(principal, ITEM_TYPE, str(doc.id), before)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(doc, key, value or {})
    await doc.save()
    await audit.record(
        principal,
        "media.update",
        ITEM_TYPE,
        str(doc.id),
        doc.storage_key,
        before=before,
        after=_snapshot(doc),
        ip_hash=ip_hash,
    )
    return to_admin(doc)


async def delete(principal: Principal, media_id: str, ip_hash: str | None) -> None:
    doc = await repo.get(media_id)
    if doc is None:
        raise NotFound("Media not found.")
    before = _snapshot(doc)
    await audit.save_version(principal, ITEM_TYPE, str(doc.id), before)
    await get_storage().delete(Bucket.PUBLIC, doc.storage_key)
    doc.deleted_at = datetime.now(UTC)
    await doc.save()
    await audit.record(
        principal,
        "media.delete",
        ITEM_TYPE,
        str(doc.id),
        doc.storage_key,
        before=before,
        ip_hash=ip_hash,
    )
