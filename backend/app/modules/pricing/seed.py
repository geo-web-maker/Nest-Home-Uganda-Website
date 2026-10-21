"""Seed the three no-price pricing blocks from spec Section 5.6."""

from app.modules.pricing.models import PricingBlock

_DEFAULT_BLOCKS = (
    {
        "key": "assessment",
        "tag": "Start here",
        "title": "Free assessment",
        "text": "A nurse visits, listens and explains the care needed.",
    },
    {
        "key": "quote",
        "tag": "After the assessment",
        "title": "Your quote",
        "text": "A clear written price for the care agreed.",
    },
    {
        "key": "plan",
        "tag": "Ongoing",
        "title": "Your care plan",
        "text": "Weekly or monthly care agreed with you.",
    },
)


def seed_data() -> list[dict[str, object]]:
    return [
        {
            "key": item["key"],
            "tag": {"en": item["tag"]},
            "title": {"en": item["title"]},
            "text": {"en": item["text"]},
            "price_text": {"en": "client to supply"},
            "show": True,
            "sort_order": index,
        }
        for index, item in enumerate(_DEFAULT_BLOCKS, start=1)
    ]


async def seed_pricing() -> int:
    """Insert missing block keys without overwriting administrator changes."""
    created = 0
    for data in seed_data():
        if await PricingBlock.find_one({"key": data["key"]}) is None:
            await PricingBlock(**data).insert()
            created += 1
    return created
