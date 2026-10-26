"""Pure policy rules for offline-created unscheduled visits."""


def is_adhoc_allowed(override: bool | None, organisation_enabled: bool) -> bool:
    """An explicit nurse override always wins over the organisation default."""
    if override is not None:
        return override
    return organisation_enabled


def active_stay_for_date(stays, local_day: str):
    """Return the most recently started stay active on an ISO Kampala-local date."""
    active = [
        stay
        for stay in stays
        if stay.starts_on <= local_day and (stay.ends_on is None or stay.ends_on >= local_day)
    ]
    return max(active, key=lambda stay: stay.starts_on) if active else None
