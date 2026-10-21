"""Job request/response schema guarantees that do not need MongoDB."""

import pytest
from pydantic import ValidationError

from app.modules.jobs.schemas import JobIn, JobPublicOut, JobUpdate


def valid_job(**changes) -> dict:
    data = {
        "title": {"en": "Registered Nurse", "lg": "Omusawo omujjanjabi"},
        "department": "clinical",
        "location": "Kampala",
        "type": "full_time",
        "description": {"en": "Client to supply"},
        "requirements": {"en": "Client to supply"},
        "closes_on": "2027-01-31",
    }
    data.update(changes)
    return data


def test_job_defaults_to_draft_and_validates_localised_title() -> None:
    item = JobIn(**valid_job())
    assert item.published is False
    assert item.title["en"] == "Registered Nurse"
    with pytest.raises(ValidationError):
        JobIn(**valid_job(title={"lg": "Omusawo"}))
    with pytest.raises(ValidationError):
        JobIn(**valid_job(title={"en": "  "}))


@pytest.mark.parametrize("closes_on", ["31-01-2027", "2027-02-30", "2027/01/31"])
def test_invalid_job_closing_dates_are_rejected(closes_on: str) -> None:
    with pytest.raises(ValidationError):
        JobIn(**valid_job(closes_on=closes_on))


def test_optional_closing_date_can_be_cleared_but_required_fields_cannot() -> None:
    assert JobUpdate(closes_on=None).model_dump(exclude_unset=True) == {"closes_on": None}
    with pytest.raises(ValidationError):
        JobUpdate(type="volunteer")
    with pytest.raises(ValidationError):
        JobUpdate(title={"lg": "Omusawo"})


def test_public_job_contract_contains_only_visitor_fields() -> None:
    item = JobPublicOut(
        id="a" * 24,
        title="Registered Nurse",
        department="clinical",
        location="Kampala",
        type="full_time",
        description="Client to supply",
        requirements="Client to supply",
        closes_on=None,
        registration_required=True,
    )
    assert set(item.model_dump()) == {
        "id",
        "title",
        "department",
        "location",
        "type",
        "description",
        "requirements",
        "closes_on",
        "registration_required",
    }
