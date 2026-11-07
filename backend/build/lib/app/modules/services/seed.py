"""Seed the eight services (spec 12.1). Only postnatal has sample copy (spec 5.3).

Nothing is invented: the other seven keep name and summary only, and the admin shows
them as "Content needed". Existing services are never overwritten (admin edits win).
"""

from app.modules.services.models import Service

_STRIP = [
    {"en": "Qualified nurses"},
    {"en": "Care plan agreed with you"},
    {"en": "Kampala and surrounds"},
]

# (number, slug, name, summary, icon_key)
_BASE = [
    (1, "elderly-companion-care", "Elderly and companion care",
     "Daily help, companionship, dignity", None),
    (2, "postnatal-newborn-care", "Postnatal and newborn care",
     "Mother and baby support at home", None),
    (3, "wound-care-medication", "Wound care and medication",
     "Dressings, injections, vitals", None),
    (4, "physiotherapy-at-home", "Physiotherapy at home",
     "Recovery, mobility, exercise", "physiotherapy"),
    (5, "palliative-respite-care", "Palliative and respite care",
     "Comfort and family relief", "palliative"),
    (6, "chronic-disease-management", "Chronic disease management",
     "Diabetes and hypertension", None),
    (7, "pediatric-home-nursing", "Pediatric home nursing",
     "Nursing care for children", "pediatric"),
    (8, "hospital-to-home", "Hospital to home transition",
     "A smooth move from ward to home", "hospital-to-home"),
]  # fmt: skip

_POSTNATAL = {
    "hero_headline": {"en": "Postnatal and newborn care, at home."},
    "hero_lead": {"en": "A trained nurse supports you and your baby in the first weeks."},
    "facts": _STRIP,
    "who_for": [
        {"en": "New mothers recovering after birth"},
        {"en": "First-time parents"},
        {"en": "Families caring for a baby after hospital discharge"},
        {"en": "Mothers recovering after a caesarean"},
    ],
    "includes": [
        {"en": "Checks on the mother\u2019s recovery"},
        {"en": "Newborn bathing and cord care guidance"},
        {"en": "Feeding support and positioning"},
        {"en": "Wound and stitch care where needed"},
        {"en": "Rest, hygiene and nutrition advice"},
        {"en": "Danger-sign education"},
    ],
}


def seed_data() -> list[dict]:
    """Plain dicts, so the content can be checked without a database."""
    docs = []
    for number, slug, name, summary, icon in _BASE:
        extra = _POSTNATAL if slug == "postnatal-newborn-care" else {}
        docs.append(
            {
                "slug": slug,
                "name": {"en": name},
                "summary": {"en": summary},
                "number": number,
                "sort_order": number,
                "icon_key": icon,
                "published": True,
                **extra,
            }
        )
    return docs


async def seed_services() -> int:
    created = 0
    for data in seed_data():
        if await Service.find_one({"slug": data["slug"]}) is None:
            await Service(**data).insert()
            created += 1
    return created
