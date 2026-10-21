"""Seed the default service areas from spec Section 12.3.

The client must confirm this default list. Existing records are not overwritten.
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
    """Insert missing defaults and leave administrator edits untouched."""
    created = 0
    for data in seed_data():
        if await Area.find_one({"name": data["name"], "deleted_at": None}) is None:
            await Area(**data).insert()
            created += 1
    return created
