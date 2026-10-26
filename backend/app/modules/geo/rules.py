"""Pure location calculations shared by field and admin workflows."""

from math import asin, cos, radians, sin, sqrt
from typing import Any

EARTH_RADIUS_M = 6_371_008.8


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi, dlambda = radians(lat2 - lat1), radians(lng2 - lng1)
    a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * asin(min(1.0, sqrt(a)))


def verify(
    event: dict[str, Any], snapshot: dict[str, Any], settings: dict[str, Any] | None = None
) -> tuple[str, float | None]:
    settings = settings or {}
    lat, lng = event.get("lat"), event.get("lng")
    if lat is None or lng is None:
        return "no_location", None
    accuracy = float(event.get("accuracy_m") or 0)
    maximum = float(settings.get("max_accuracy_m", 100))
    if accuracy > maximum:
        return "low_accuracy", haversine_m(lat, lng, snapshot["lat"], snapshot["lng"])
    distance = haversine_m(lat, lng, snapshot["lat"], snapshot["lng"])
    radius = float(snapshot.get("radius_m", 150))
    return ("verified" if distance <= radius + min(accuracy, 50) else "outside_radius"), distance
