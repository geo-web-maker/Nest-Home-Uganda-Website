"""Cloudinary signing and deletion helpers for private care-photo workflows.

All Cloudinary-specific URL and signature handling stays in this module so the
rest of the application does not construct provider URLs or leak API secrets.
"""

from __future__ import annotations

from base64 import urlsafe_b64encode
from hashlib import sha1
from typing import Any

import httpx

from app.core.config import Settings

PHOTO_FOLDER = "nest-home-care/visit-proof"
ALLOWED_IMAGE_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})


def upload_signature(
    settings: Settings,
    *,
    public_id: str,
    timestamp: int,
    folder: str = PHOTO_FOLDER,
    delivery_type: str = "private",
) -> dict[str, Any]:
    """Return the signed upload fields required by Cloudinary's unsigned client flow."""
    if (
        not settings.cloudinary_cloud_name
        or not settings.cloudinary_api_key
        or not settings.cloudinary_api_secret
    ):
        raise ValueError("Photo storage is not configured")
    if not public_id or any(char in public_id for char in "\\/?#"):
        raise ValueError("Invalid photo identifier")
    if folder != PHOTO_FOLDER:
        raise ValueError("Unsupported photo folder")
    if delivery_type not in {"upload", "private"}:
        raise ValueError("Unsupported photo delivery type")
    signing_text = (
        f"folder={folder}&public_id={public_id}&timestamp={timestamp}"
        f"&type={delivery_type}{settings.cloudinary_api_secret}"
    )
    # Cloudinary's signature scheme is defined as SHA-1; this is not a password hash.
    signature = sha1(signing_text.encode("utf-8")).hexdigest()  # noqa: S324
    return {
        "cloud_name": settings.cloudinary_cloud_name,
        "api_key": settings.cloudinary_api_key,
        "timestamp": timestamp,
        "folder": folder,
        "type": delivery_type,
        "public_id": public_id,
        "signature": signature,
        "upload_url": f"https://api.cloudinary.com/v1_1/{settings.cloudinary_cloud_name}/image/upload",
    }


async def delete_asset(
    settings: Settings,
    public_id: str,
    *,
    delivery_type: str = "upload",
    timeout_seconds: float = 10.0,
) -> bool:
    """Delete a photo asset; an already-absent asset is treated as idempotent success."""
    if (
        not settings.cloudinary_cloud_name
        or not settings.cloudinary_api_key
        or not settings.cloudinary_api_secret
    ):
        raise ValueError("Photo storage is not configured")
    if not public_id or not public_id.startswith(f"{PHOTO_FOLDER}/"):
        raise ValueError("Photo identifier is outside the approved folder")
    if delivery_type not in {"upload", "private"}:
        raise ValueError("Unsupported photo delivery type")
    timestamp = __import__("time").time_ns() // 1_000_000_000
    signing_text = (
        f"public_id={public_id}&timestamp={timestamp}"
        f"&type={delivery_type}{settings.cloudinary_api_secret}"
    )
    signature = sha1(signing_text.encode("utf-8")).hexdigest()  # noqa: S324 (Cloudinary SHA-1)
    endpoint = f"https://api.cloudinary.com/v1_1/{settings.cloudinary_cloud_name}/image/destroy"
    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        response = await client.post(
            endpoint,
            data={
                "public_id": public_id,
                "timestamp": timestamp,
                "type": delivery_type,
                "api_key": settings.cloudinary_api_key,
                "signature": signature,
            },
        )
    response.raise_for_status()
    result = response.json().get("result")
    return result in {"ok", "not found"}


async def verify_asset(
    settings: Settings,
    public_id: str,
    *,
    delivery_type: str = "upload",
    timeout_seconds: float = 10.0,
) -> dict[str, Any]:
    """Verify that a signed upload exists in the approved Cloudinary folder."""
    from urllib.parse import quote

    if (
        not settings.cloudinary_cloud_name
        or not settings.cloudinary_api_key
        or not settings.cloudinary_api_secret
    ):
        raise ValueError("Photo storage is not configured")
    if not public_id or not public_id.startswith(f"{PHOTO_FOLDER}/"):
        raise ValueError("Photo identifier is outside the approved folder")
    if delivery_type not in {"upload", "private"}:
        raise ValueError("Unsupported photo delivery type")
    endpoint = (
        f"https://api.cloudinary.com/v1_1/{settings.cloudinary_cloud_name}"
        f"/resources/image/{delivery_type}/{quote(public_id, safe='/')}"
    )
    async with httpx.AsyncClient(
        timeout=timeout_seconds, auth=(settings.cloudinary_api_key, settings.cloudinary_api_secret)
    ) as client:
        response = await client.get(endpoint)
    if response.status_code == 404:
        raise LookupError("Cloudinary asset was not found")
    response.raise_for_status()
    data = response.json()
    if data.get("public_id") != public_id or data.get("resource_type") != "image":
        raise ValueError("Cloudinary asset metadata did not match the registered photo")
    return {
        "public_id": public_id,
        "bytes": int(data.get("bytes", 0)),
        "format": data.get("format", ""),
        "width": int(data.get("width", 0)),
        "height": int(data.get("height", 0)),
    }


def signed_delivery_url(
    settings: Settings, public_id: str, *, delivery_type: str = "private", thumbnail: bool = False
) -> str:
    """Create a Cloudinary delivery URL signed on the server, never in the client.

    The signature includes the exact final transformation and public ID. Changing either
    invalidates the URL. Thumbnail transformation uses a fixed, reviewable template.
    """
    if not settings.cloudinary_cloud_name or not settings.cloudinary_api_secret:
        raise ValueError("Photo storage is not configured")
    if (
        not public_id
        or not public_id.startswith(f"{PHOTO_FOLDER}/")
        or any(c in public_id for c in "\\?#")
    ):
        raise ValueError("Photo identifier is outside the approved folder")
    if delivery_type not in {"upload", "private"}:
        raise ValueError("Unsupported photo delivery type")
    transformation = "c_fill,w_480,h_320,q_auto,f_auto" if thumbnail else "q_auto,f_auto"
    signed_path = f"{transformation}/{public_id}"
    digest = (
        urlsafe_b64encode(
            sha1((signed_path + settings.cloudinary_api_secret).encode()).digest()  # noqa: S324
        )
        .decode()
        .rstrip("=")
    )
    signature = digest[:8]
    return f"https://res.cloudinary.com/{settings.cloudinary_cloud_name}/image/{delivery_type}/s--{signature}--/{signed_path}"


def temporary_stream_signature(
    settings: Settings, *, actor_id: str, visit_id: str, photo_id: str, variant: str, expires: int
) -> str:
    """HMAC for a short-lived API proxy URL; binds actor, visit, photo, variant and expiry."""
    import hashlib
    import hmac

    if not settings.secret_key:
        raise ValueError("Application signing secret is not configured")
    payload = f"{actor_id}|{visit_id}|{photo_id}|{variant}|{expires}"
    return hmac.new(settings.secret_key.encode(), payload.encode(), hashlib.sha256).hexdigest()


def verify_temporary_stream_signature(
    settings: Settings,
    *,
    actor_id: str,
    visit_id: str,
    photo_id: str,
    variant: str,
    expires: int,
    signature: str,
    now: int,
) -> bool:
    import hmac

    if expires < now or expires > now + 300 or variant not in {"thumbnail", "original"}:
        return False
    try:
        expected = temporary_stream_signature(
            settings,
            actor_id=actor_id,
            visit_id=visit_id,
            photo_id=photo_id,
            variant=variant,
            expires=expires,
        )
    except ValueError:
        return False
    return hmac.compare_digest(expected, signature)
