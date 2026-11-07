"""Seed the default service areas from spec Section 12.3.

The client must confirm this default list. Seeded once: when any area exists (even a
deleted one) nothing is added, so administrator edits and deletions stay.
"""

from app.modules.areas.models import Area

_DEFAULT_AREAS = (
    "Kampala Central",
    "Kololo",
    "Nakasero",
    "Ntinda",
    "Bugolobi",
    "Muyenga",
    "Kisaasi",
    "Kawempe",
    "Makindye",
    "Entebbe Road",
    "Mukono",
    "Wakiso",
)


def seed_data() -> list[dict[str, object]]:
    return [
        {"name": name, "sort_order": index, "aliases": []}
        for index, name in enumerate(_DEFAULT_AREAS, start=1)
    ]


async def seed_areas() -> int:
    """Seed the default list once. A renamed or deleted area must not come back on a later run."""
    if await Area.find_all().count() > 0:
        return 0
    created = 0
    for data in seed_data():
        await Area(**data).insert()
        created += 1
    return created
