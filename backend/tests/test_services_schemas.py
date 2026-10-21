from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.modules.services.schemas import ServiceIn, ServiceUpdate
from app.modules.services.seed import seed_data
from app.modules.services.service import content_needed

EMPTY_COPY = {"hero_headline": {}, "hero_lead": {}, "who_for": [], "includes": [], "facts": []}


def valid(**kw) -> dict:
    return {"slug": "postnatal-newborn-care", "name": {"en": "Postnatal care"}, **kw}


def test_minimal_service_is_valid_and_unpublished() -> None:
    s = ServiceIn(**valid())
    assert s.published is False and s.facts == []


@pytest.mark.parametrize("slug", ["Bad Slug", "UPPER", "a", "-x", "x-", "a--b", "a/b", ""])
def test_bad_slugs_rejected(slug: str) -> None:
    with pytest.raises(ValidationError):
        ServiceIn(**valid(slug=slug))


def test_english_name_required() -> None:
    with pytest.raises(ValidationError):
        ServiceIn(**valid(name={"lg": "Obujjanjabi"}))
    with pytest.raises(ValidationError):
        ServiceIn(**valid(name={"en": "   "}))


def test_facts_limited_to_three() -> None:
    with pytest.raises(ValidationError):
        ServiceIn(**valid(facts=[{"en": "a"}] * 4))


def test_text_is_trimmed_and_language_codes_checked() -> None:
    assert ServiceIn(**valid(name={"en": "  Care  "})).name == {"en": "Care"}
    with pytest.raises(ValidationError):
        ServiceIn(**valid(name={"en": "x", "not a code": "y"}))


def test_ids_must_be_object_ids_and_related_is_deduplicated() -> None:
    with pytest.raises(ValidationError):
        ServiceIn(**valid(related=["nope"]))
    a = "a" * 24
    assert ServiceIn(**valid(related=[a, a])).related == [a]
    with pytest.raises(ValidationError):
        ServiceIn(**valid(related=["a" * 24, "b" * 24, "c" * 24, "d" * 24]))


def test_update_only_carries_fields_that_were_sent() -> None:
    body = ServiceUpdate(sort_order=3)
    assert body.model_dump(exclude_unset=True) == {"sort_order": 3}
    with pytest.raises(ValidationError):
        ServiceUpdate(name={"lg": "x"})


def test_seed_has_eight_services_in_order_with_only_postnatal_copy() -> None:
    docs = seed_data()
    assert [d["slug"] for d in docs] == [
        "elderly-companion-care", "postnatal-newborn-care", "wound-care-medication",
        "physiotherapy-at-home", "palliative-respite-care", "chronic-disease-management",
        "pediatric-home-nursing", "hospital-to-home",
    ]  # fmt: skip
    assert [d["number"] for d in docs] == list(range(1, 9))
    complete = [
        d["slug"] for d in docs if not content_needed(SimpleNamespace(**{**EMPTY_COPY, **d}))
    ]
    assert complete == ["postnatal-newborn-care"]
    assert [d["slug"] for d in docs if d["icon_key"]] == [
        "physiotherapy-at-home", "palliative-respite-care", "pediatric-home-nursing",
        "hospital-to-home",
    ]  # fmt: skip
    assert all(ServiceIn(**{**d, "icon_key": d["icon_key"]}) for d in docs)
    assert all("\u2014" not in str(d) for d in docs)  # no em dashes (rule 12)
