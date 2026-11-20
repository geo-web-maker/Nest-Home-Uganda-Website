"""Server-owned mobile/PWA release policy."""

from datetime import UTC, datetime

from beanie import Document
from pydantic import Field


class AppRelease(Document):
    id: str = Field(index=True, unique=True)
    platform: str = Field(pattern="^(android|ios|web)$", index=True)
    version: str
    version_code: int | None = None          # Android numeric build number
    min_supported_version: str
    download_path: str | None = None          # external/fallback URL
    apk_key: str | None = None               # private-bucket key → signed URL
    sha256: str | None = None                # hex digest of the APK (or web bundle zip)
    app: str = "nurse"                       # which Capacitor app a web bundle belongs to
    bundle_key: str | None = None            # private-bucket key of a web-bundle zip (platform="web")
    min_native_version_code: int | None = None  # oldest APK versionCode able to run this bundle
    size_bytes: int | None = None
    release_notes: str = Field(default="", max_length=2000)
    active: bool = True
    published_at: datetime = Field(default_factory=lambda: datetime.now(UTC), index=True)
    created_by: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "app_releases"
