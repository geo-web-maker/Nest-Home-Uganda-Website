"""Photo-evidence rules shared by field visit enforcement and unit tests."""

from collections.abc import Iterable

PHOTO_REQUIREMENT_MODES = frozenset({"none", "arrival", "departure", "either", "both"})
PHOTO_TYPES = frozenset({"arrival", "departure", "other"})


def missing_required_photo_evidence(required_mode: str, photo_types: Iterable[str]) -> bool:
    """Return whether a visit lacks evidence required to complete checkout.

    Only registered server-side uploads should be passed as ``photo_types``.
    Local pending photos are used by the UI for its immediate affordance; the
    sync order uploads them before submitting checkout, so the server remains
    authoritative.
    """
    if required_mode not in PHOTO_REQUIREMENT_MODES:
        raise ValueError("Unknown photo requirement mode")
    available = {photo_type for photo_type in photo_types if photo_type in PHOTO_TYPES}
    if required_mode == "none":
        return False
    if required_mode == "arrival":
        return "arrival" not in available
    if required_mode == "departure":
        return "departure" not in available
    if required_mode == "either":
        return not bool(available & {"arrival", "departure"})
    return not {"arrival", "departure"}.issubset(available)
