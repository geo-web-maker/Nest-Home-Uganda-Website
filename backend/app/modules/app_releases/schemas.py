import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.modules.app_releases.rules import parse_version

_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


class AppReleaseCreate(BaseModel):
    id: str = Field(min_length=8, max_length=160)
    platform: Literal["android", "ios", "web"]
    version: str = Field(min_length=5, max_length=80)
    version_code: int | None = Field(default=None, ge=1)
    min_supported_version: str = Field(min_length=5, max_length=80)
    download_path: str | None = Field(default=None, max_length=1000)
    apk_key: str | None = Field(default=None, max_length=500)
    sha256: str | None = Field(default=None, max_length=64)
    size_bytes: int | None = Field(default=None, ge=1)
    release_notes: str = Field(default="", max_length=2000)
    active: bool = True
    app: Literal["nurse", "admin"] = "nurse"
    bundle_key: str | None = Field(default=None, max_length=500)
    min_native_version_code: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def bundle_rules(self) -> "AppReleaseCreate":
        if self.bundle_key and self.platform != "web":
            raise ValueError("bundle_key is only valid for platform web")
        if self.platform == "web" and self.bundle_key and not self.sha256:
            raise ValueError("A web bundle release requires sha256")
        return self

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

    @field_validator("sha256")
    @classmethod
    def valid_sha256(cls, value: str | None) -> str | None:
        if value and not _SHA256_RE.match(value):
            raise ValueError("sha256 must be 64 lowercase hex characters")
        return value


class AppReleaseOut(BaseModel):
    id: str
    platform: str
    version: str
    version_code: int | None
    min_supported_version: str
    download_path: str | None
    apk_key: str | None
    sha256: str | None
    size_bytes: int | None
    release_notes: str
    active: bool
    published_at: datetime
