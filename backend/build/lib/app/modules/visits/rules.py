"""Visit snapshot, transition, overlap, and timing rules."""

from datetime import date, datetime
from typing import Any


class VisitRuleError(ValueError):
    pass


def make_snapshot(place: dict[str, Any]) -> dict[str, Any]:
    return {key: place.get(key) for key in ("address_text", "lat", "lng", "radius_m", "geo")}


def next_status(visit: dict[str, Any], event_type: str) -> str:
    status = visit.get("status", "scheduled")
    if status in {"cancelled", "completed"}:
        raise VisitRuleError(f"visit_{status}")
    if event_type == "check_in":
        if status == "in_progress":
            raise VisitRuleError("already_checked_in")
        if status not in {"scheduled", "missed"}:
            raise VisitRuleError("invalid_transition")
        return "in_progress"
    if event_type == "check_out":
        if status != "in_progress":
            raise VisitRuleError("not_checked_in")
        return "completed"
    raise VisitRuleError("unknown_event")


def overlaps(start: datetime, end: datetime, other_start: datetime, other_end: datetime) -> bool:
    return start < other_end and other_start < end


def validate_schedule(
    start: datetime,
    end: datetime,
    client_id: str,
    place: dict[str, Any],
    nurse_id: str,
    existing: list[dict[str, Any]],
    confirm_overlap: bool = False,
) -> list[str]:
    if end <= start:
        raise VisitRuleError("end_must_follow_start")
    if str(place.get("client_id")) != str(client_id):
        raise VisitRuleError("place_client_mismatch")
    clashes = [
        str(v.get("id"))
        for v in existing
        if v.get("nurse_id") == nurse_id
        and v.get("status") in {"scheduled", "in_progress"}
        and overlaps(start, end, v["scheduled_start"], v["scheduled_end"])
    ]
    if clashes and not confirm_overlap:
        raise VisitRuleError("nurse_busy:" + ",".join(clashes))
    return clashes


def flags_for_event(
    event_result: dict[str, Any], visit: dict[str, Any], settings: dict[str, Any]
) -> list[str]:
    flags = []
    verification = event_result.get("verification")
    if verification in {"no_location", "low_accuracy", "outside_radius"}:
        flags.append(verification)
    if (
        abs(float(event_result.get("clock_offset_s") or 0))
        > float(settings.get("clock_skew_min", 10)) * 60
    ):
        flags.append("clock_skew")
    if event_result.get("type") == "check_out":
        start = visit.get("scheduled_start")
        end = visit.get("scheduled_end")
        actual_start = visit.get("check_in_at")
        actual_end = event_result.get("device_time")
        if start and end and actual_start and actual_end:
            scheduled = (end - start).total_seconds()
            actual = (actual_end - actual_start).total_seconds()
            if (
                scheduled > 0
                and actual < scheduled * float(settings.get("short_visit_pct", 50)) / 100
            ):
                flags.append("duration_short")
            if (
                scheduled > 0
                and actual > scheduled * float(settings.get("long_visit_pct", 200)) / 100
            ):
                flags.append("duration_long")
    return flags


def current_place(stays: list[dict[str, Any]], on_date: date) -> dict[str, Any] | None:
    for stay in sorted(stays, key=lambda x: x["starts_on"], reverse=True):
        if stay["starts_on"] <= on_date and (
            stay.get("ends_on") is None or on_date < stay["ends_on"]
        ):
            return stay
    return None


def move_client(
    stays: list[dict[str, Any]], new_place_id: str, starts_on: date
) -> list[dict[str, Any]]:
    if any(s["starts_on"] > starts_on for s in stays):
        raise VisitRuleError("backdated_or_out_of_order_move")
    result = [dict(s) for s in stays]
    for stay in result:
        if stay.get("ends_on") is None:
            if starts_on <= stay["starts_on"]:
                raise VisitRuleError("backdated_move")
            stay["ends_on"] = starts_on
    if any(
        s["starts_on"] <= starts_on and (s.get("ends_on") is None or starts_on < s["ends_on"])
        for s in result
    ):
        raise VisitRuleError("stay_overlap")
    result.append({"place_id": new_place_id, "starts_on": starts_on, "ends_on": None})
    return result
