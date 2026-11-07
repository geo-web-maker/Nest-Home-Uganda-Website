"""Seed the three draft job examples listed in spec Section 12.4."""

from typing import Any

_SAMPLE_JOBS = (
    ("Registered Nurse", "clinical", "full_time"),
    ("Midwife", "clinical", "part_time"),
    ("Caregiver and Companion", "care", "contract"),
)


def seed_data() -> list[dict[str, Any]]:
    return [
        {
            "title": {"en": title},
            "department": department,
            "location": "Kampala",
            "type": job_type,
            "description": {"en": "client to supply"},
            "requirements": {"en": "client to supply"},
            "closes_on": None,
            "registration_required": department == "clinical",
            "published": False,
            "show_closing": False,
            "closed_at": None,
        }
        for title, department, job_type in _SAMPLE_JOBS
    ]


async def seed_jobs(job_model: Any) -> int:
    """Seed the three drafts once. A retitled, closed or deleted job must not bring them back."""
    if await job_model.find_all().count() > 0:
        return 0
    created = 0
    for data in seed_data():
        await job_model(**data).insert()
        created += 1
    return created
