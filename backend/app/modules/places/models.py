from datetime import UTC, datetime
from typing import Literal

from beanie import Document
from pydantic import Field
from app.core.sandbox import hide_test_data


@hide_test_data("created_by")
class CarePlace(Document):
    id: str = Field(index=True, unique=True)
    client_id: str = Field(index=True)
    label: str = Field(default="Home", max_length=80)
    address_text: str = Field(default="", max_length=300)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    radius_m: int = Field(default=150, ge=50, le=1000)
    # How the location was chosen, so staff can judge how far to trust it.
    # Older rows read as "unknown".
    location_source: Literal["pin", "gps", "search", "coordinates", "unknown"] = "unknown"
    is_primary: bool = False
    created_by: str | None = None
    geo: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "care_places"


class PlaceStay(Document):
    id: str = Field(index=True, unique=True)
    client_id: str = Field(index=True)
    place_id: str = Field(index=True)
    starts_on: str
    ends_on: str | None = None

    class Settings:
        name = "place_stays"
