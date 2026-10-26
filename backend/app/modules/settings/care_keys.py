"""Typed, safe defaults for care settings. Values are environment-overridable at runtime."""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CareSetting:
    id: str
    type: str
    default: Any
    required_before_go_live: bool = False
    overridable_at: tuple[str, ...] = ("org",)
    group: str = "care"
    minimum: float | None = None
    maximum: float | None = None


CARE_SETTINGS: dict[str, CareSetting] = {}


def _add(
    key, kind, default, required=False, scopes=("org",), group="care", minimum=None, maximum=None
):
    CARE_SETTINGS[key] = CareSetting(key, kind, default, required, scopes, group, minimum, maximum)


for row in [
    ("care.module_enabled", "boolean", False, True),
    ("care.module_b_enabled", "boolean", False),
    ("care.module_c_enabled", "boolean", False),
    ("care.module_d_enabled", "boolean", False),
    ("auth.login_identifier", "choice", "either", False, ("org",), "auth"),
    ("visits.sync_window_past_hours", "integer", 24, False, ("org",), "visits", 0, 720),
    ("visits.sync_window_future_days", "integer", 14, False, ("org",), "visits", 1, 180),
    ("field.geo_snap_wait_s", "integer", 3, False, ("org",), "field", 0, 60),
    ("field.checkin_fix_wait_s", "integer", 10, False, ("org",), "field", 0, 120),
    ("field.max_accuracy_m", "integer", 100, True, ("org",), "field", 1, 1000),
    ("field.adhoc_allowed", "boolean", False),
    ("visits.adhoc_enabled", "boolean", False),
    ("visits.adhoc_default_minutes", "integer", 60, False, ("org",), "visits", 15, 240),
    (
        "geo.default_radius_m",
        "integer",
        150,
        True,
        ("org", "team", "client", "place"),
        "geo",
        50,
        1000,
    ),
    (
        "geo.max_accuracy_m",
        "integer",
        100,
        True,
        ("org", "team", "client", "place"),
        "geo",
        1,
        1000,
    ),
    ("thresholds.clock_skew_min", "integer", 10, False, ("org",), "thresholds", 0, 1440),
    ("thresholds.short_visit_pct", "integer", 50, False, ("org",), "thresholds", 0, 100),
    ("thresholds.long_visit_pct", "integer", 200, False, ("org",), "thresholds", 100, 1000),
    ("privacy.notice_text", "text", "", True, ("org",), "privacy"),
    ("privacy.notice_version", "text", "", True, ("org",), "privacy"),
    ("consent.location_text", "text", "", True, ("org",), "consent"),
    ("consent.location_version", "text", "", True, ("org",), "consent"),
    ("app.location_disclosure", "text", "", True, ("org",), "app"),
    ("photos.guidance", "text", "", True, ("org",), "photos"),
    ("sos.procedure", "text", "", False, ("org",), "sos"),
    ("sos.on_call_contacts", "map", {}, False, ("org",), "sos"),
    ("sms.test_number", "text", "", True, ("org",), "sms"),
    ("alerts.quiet_start", "time", "22:00", False, ("org",), "alerts"),
    ("alerts.quiet_end", "time", "06:00", False, ("org",), "alerts"),
    ("retention.coordinates_months", "integer", 0, True, ("org",), "retention", 0, 120),
    ("retention.photos_months", "integer", 0, True, ("org",), "retention", 0, 120),
    ("retention.sos_months", "integer", 0, True, ("org",), "retention", 0, 120),
    ("retention.requests_months", "integer", 0, True, ("org",), "retention", 0, 120),
    ("ops.database_tier_ok", "boolean", False, True, ("org",), "ops"),
    ("ops.restore_test_passed", "boolean", False, True, ("org",), "ops"),
    ("ops.database_off_m0", "boolean", False, True, ("org",), "ops"),
    ("sos.enabled", "boolean", False),
    ("sos.responder_configured", "boolean", False),
    ("sos.emergency_numbers", "list", []),
    ("sms.enabled", "boolean", False),
    ("sms.test_number", "text", ""),
    ("photos.enabled", "boolean", False),
    ("photos.max_mb", "integer", 5, False, ("org",), "photos", 1, 20),
    ("photos.max_per_visit", "integer", 5, False, ("org",), "photos", 0, 20),
    ("care.map_tile_url", "text", ""),
    ("care.privacy_notice_version", "text", ""),
    ("care.min_app_version", "text", "0.1.0"),
    ("alerts.sms_after_unacked_min", "integer", 15, False, ("org",), "alerts", 1, 240),
    ("alerts.quiet_hours", "text", "22:00-07:00"),
    ("sms.monthly_cap", "integer", 1000, False, ("org",), "sms", 0, 100000),
    ("timesheets.period_kind", "choice", "weekly", False, ("org",), "timesheets"),
    ("timesheets.approver_required", "boolean", True),
    ("timesheets.rounding_minutes", "integer", 1, False, ("org",), "timesheets", 1, 60),
    ("timesheets.auto_submit", "boolean", False),
    ("timesheets.export_approved_only", "boolean", True),
]:
    key, kind, default, *rest = row
    required = rest[0] if len(rest) > 0 else False
    scopes = rest[1] if len(rest) > 1 else ("org",)
    group = rest[2] if len(rest) > 2 else key.split(".")[0]
    minimum = rest[3] if len(rest) > 3 else None
    maximum = rest[4] if len(rest) > 4 else None
    _add(key, kind, default, required, scopes, group, minimum, maximum)


def validate_value(key: str, value: Any) -> Any:
    spec = CARE_SETTINGS[key]
    valid = {
        "boolean": lambda x: isinstance(x, bool),
        "integer": lambda x: isinstance(x, int) and not isinstance(x, bool),
        "text": lambda x: isinstance(x, str),
        "list": lambda x: isinstance(x, list),
        "choice": lambda x: isinstance(x, str),
        "time": lambda x: isinstance(x, str) and len(x) == 5 and x[2] == ":",
        "map": lambda x: isinstance(x, dict),
    }[spec.type]
    if not valid(value):
        raise ValueError(f"{key} must be {spec.type}")
    if spec.minimum is not None and value < spec.minimum:
        raise ValueError(f"{key} is below minimum")
    if spec.maximum is not None and value > spec.maximum:
        raise ValueError(f"{key} is above maximum")
    if spec.type == "time" and (
        len(value) != 5
        or value[2] != ":"
        or not value[:2].isdigit()
        or not value[3:].isdigit()
        or int(value[:2]) > 23
        or int(value[3:]) > 59
    ):
        raise ValueError(f"{key} must be HH:MM")
    if key == "auth.login_identifier" and value not in {"email", "phone", "either"}:
        raise ValueError("auth.login_identifier must be email, phone, or either")
    if key == "timesheets.period_kind" and value not in {"weekly", "fortnightly", "monthly"}:
        raise ValueError("invalid timesheet period")
    return value
