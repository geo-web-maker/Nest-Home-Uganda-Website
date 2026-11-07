from typing import Any

from pydantic import BaseModel


class SettingEntry(BaseModel):
    key: str
    group: str
    value: Any


class PublicSiteSettings(BaseModel):
    business: dict[str, Any]
    home: dict[str, Any]
    forms: dict[str, Any]
    theme: dict[str, Any]
    seo: dict[str, Any]
    site: dict[str, Any]
