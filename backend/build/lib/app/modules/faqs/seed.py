"""Seed the six default FAQ questions from spec Section 5.9.

Answers are not specified by the client. They use the exact placeholder and remain
unpublished until a content editor supplies answers.
"""

from app.modules.faqs.models import Faq

_DEFAULT_QUESTIONS = (
    "How quickly can care start?",
    "Are your nurses qualified?",
    "How much does it cost?",
    "Which areas do you cover?",
    "Can I choose the same nurse each time?",
    "What if I need to cancel?",
)


def seed_data() -> list[dict[str, object]]:
    return [
        {
            "question": {"en": question},
            "answer": {"en": "client to supply"},
            "service_id": None,
            "sort_order": index,
            "published": False,
        }
        for index, question in enumerate(_DEFAULT_QUESTIONS, start=1)
    ]


async def seed_faqs() -> int:
    """Seed the six questions once. An edited or deleted question must not come back."""
    if await Faq.find_all().count() > 0:
        return 0
    created = 0
    for data in seed_data():
        await Faq(**data).insert()
        created += 1
    return created
