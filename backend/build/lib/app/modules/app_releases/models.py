"""Server-owned mobile/PWA release policy."""

from datetime import UTC, datetime

from beanie import Document
from pydantic import Field


class AppRelease(Document):
    id: str = Field(index=True, unique=True)
    platform: str = Field(pattern="^(android|ios|web)$", index=True)
    version: str
    min_supported_version: str
    download_path: str | None = None
    release_notes: str = Field(default="", max_length=2000)
    active: bool = True
    published_at: datetime = Field(default_factory=lambda: datetime.now(UTC), index=True)
    created_by: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "app_releases"
