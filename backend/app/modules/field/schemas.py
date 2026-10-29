from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class EventIn(BaseModel):
    id: str = Field(min_length=8, max_length=160)
    client_op_id: str = Field(min_length=8, max_length=160)
    device_time: datetime
    sent_at_device: datetime
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    accuracy_m: float = Field(default=0, ge=0, le=100000)
    source: Literal["app_auto", "app_manual", "pwa_manual"] = "pwa_manual"
    device_info: dict[str, Any] = Field(default_factory=dict)
    safety_timer_minutes: int | None = Field(default=None, ge=1, le=480)


class NoteIn(BaseModel):
    id: str = Field(min_length=8, max_length=160)
    client_op_id: str = Field(min_length=8, max_length=160)
    body: str = Field(min_length=1, max_length=1000)
    created_at_device: datetime
    geo_snap: dict[str, Any] = Field(default_factory=dict)


class ConsentIn(BaseModel):
    type: str = Field(min_length=1, max_length=80)
    version: str = Field(min_length=1, max_length=80)


class HeartbeatIn(BaseModel):
    device_id: str = Field(min_length=8, max_length=160)
    app_version: str = Field(min_length=1, max_length=80)
    platform: Literal["android", "ios", "web"]
    battery_pct: int | None = Field(default=None, ge=0, le=100)


class FieldVisitResponse(BaseModel):
    id: str
    client_display_name: str
    place_address_text: str
    lat: float | None
    lng: float | None
    scheduled_start: datetime
    scheduled_end: datetime
    status: str
    instructions: str
    adhoc: bool
    check_in_at: datetime | None
    check_out_at: datetime | None
    verification_label: str
    photo_count: int
    photo_types: list[str] = Field(default_factory=list)
    photo_rules: dict[str, bool | str | None]
    safety_state: str
