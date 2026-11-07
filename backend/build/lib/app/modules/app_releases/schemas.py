from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.modules.app_releases.rules import parse_version


class AppReleaseCreate(BaseModel):
    id: str = Field(min_length=8, max_length=160)
    platform: Literal["android", "ios", "web"]
    version: str = Field(min_length=5, max_length=80)
    min_supported_version: str = Field(min_length=5, max_length=80)
    download_path: str | None = Field(default=None, max_length=1000)
    release_notes: str = Field(default="", max_length=2000)
    active: bool = True

    @field_validator("version", "min_supported_version")
    @classmethod
    def valid_semver(cls, value: str) -> str:
        parse_version(value)
        return value

    @field_validator("download_path")
    @classmethod
    def safe_path(cls, value: str | None) -> str | None:
        if value and (value.startswith("//") or value.lower().startswith(("javascript:", "data:"))):
            raise ValueError("download_path must be a same-origin path or approved HTTPS URL")
        if value and not value.startswith(("/", "https://")):
            raise ValueError("download_path must begin with / or https://")
        return value


class AppReleaseOut(BaseModel):
    id: str
    platform: str
    version: str
    min_supported_version: str
    download_path: str | None
    release_notes: str
    active: bool
    published_at: datetime
