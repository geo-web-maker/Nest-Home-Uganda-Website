from typing import Any

from app.modules.settings.care_keys import CARE_SETTINGS


def resolve(
    key: str,
    org: dict[str, Any],
    team: dict[str, Any] | None = None,
    client: dict[str, Any] | None = None,
    place: dict[str, Any] | None = None,
):
    spec = CARE_SETTINGS[key]
    for level, values in (("place", place), ("client", client), ("team", team), ("org", org)):
        if level in spec.overridable_at and values is not None and key in values:
            return values[key]
    return spec.default


def resolve_sos_enabled(values: dict[str, Any]) -> tuple[bool, str | None]:
    if not values.get("sos.enabled", False):
        return False, None
    missing = [k for k in ("sos.responder_configured", "sms.enabled") if not values.get(k, False)]
    if not values.get("sos.emergency_numbers"):
        missing.append("sos.emergency_numbers")
    if missing:
        return False, "Missing SOS prerequisites: " + ", ".join(missing)
    return True, None
