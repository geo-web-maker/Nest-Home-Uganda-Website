"""S5.24: seed data matches the schemas and the spec (section 12). No database needed."""

import pytest

from app.modules.areas.schemas import AreaIn
from app.modules.areas.seed import seed_data as area_seed
from app.modules.faqs.schemas import FaqIn
from app.modules.faqs.seed import seed_data as faq_seed
from app.modules.jobs.schemas import JobIn
from app.modules.jobs.seed import seed_data as job_seed
from app.modules.pricing.schemas import PricingBlockIn
from app.modules.pricing.seed import seed_data as pricing_seed
from app.modules.services.schemas import ServiceIn
from app.modules.services.seed import seed_data as service_seed

PLACEHOLDER = "client to supply"


def _all_text(value: object) -> str:
    return str(value)


@pytest.mark.parametrize(
    "docs", [service_seed(), area_seed(), faq_seed(), pricing_seed(), job_seed()]
)
def test_no_em_or_en_dashes_in_seed_copy(docs: list) -> None:
    text = _all_text(docs)
    assert "\u2014" not in text and "\u2013" not in text


def test_areas_are_the_twelve_from_spec_12_3_in_order() -> None:
    docs = area_seed()
    assert [d["name"] for d in docs] == [
        "Kampala Central", "Kololo", "Nakasero", "Ntinda", "Bugolobi", "Muyenga",
        "Kisaasi", "Kawempe", "Makindye", "Entebbe Road", "Mukono", "Wakiso",
    ]  # fmt: skip
    assert [d["sort_order"] for d in docs] == list(range(1, 13))
    assert all(AreaIn(**d) for d in docs)


def test_faqs_are_the_six_from_spec_5_9_unpublished_with_the_placeholder() -> None:
    docs = faq_seed()
    assert [d["question"]["en"] for d in docs] == [
        "How quickly can care start?",
        "Are your nurses qualified?",
        "How much does it cost?",
        "Which areas do you cover?",
        "Can I choose the same nurse each time?",
        "What if I need to cancel?",
    ]
    assert all(d["answer"] == {"en": PLACEHOLDER} and d["published"] is False for d in docs)
    assert all(FaqIn(**d) for d in docs)


def test_pricing_blocks_follow_spec_5_6_and_carry_no_price() -> None:
    docs = pricing_seed()
    assert [d["key"] for d in docs] == ["assessment", "quote", "plan"]
    assert [d["tag"]["en"] for d in docs] == ["Start here", "After the assessment", "Ongoing"]
    assert [d["title"]["en"] for d in docs] == [
        "Free assessment",
        "Your quote",
        "Your care plan",
    ]
    assert all(d["price_text"] == {} for d in docs)  # no prices at launch
    assert all(PricingBlockIn(**d) for d in docs)


def test_jobs_are_the_three_drafts_from_spec_12_4() -> None:
    docs = job_seed()
    assert [(d["title"]["en"], d["location"], d["type"]) for d in docs] == [
        ("Registered Nurse", "Kampala", "full_time"),
        ("Midwife", "Kampala", "part_time"),
        ("Caregiver and Companion", "Kampala", "contract"),
    ]
    assert all(d["published"] is False for d in docs)
    assert all(d["description"] == {"en": PLACEHOLDER} for d in docs)
    for d in docs:
        assert JobIn(**{k: v for k, v in d.items() if k != "closed_at"})


def test_services_seed_still_matches_the_service_schema() -> None:
    assert all(ServiceIn(**d) for d in service_seed())
