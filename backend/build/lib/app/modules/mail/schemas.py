from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class MailSettingsPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    values: dict[str, Any] = Field(min_length=1, max_length=100)


class MailSettingsOut(BaseModel):
    items: list[dict[str, Any]]
    feature_enabled: bool
