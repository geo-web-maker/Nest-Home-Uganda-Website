from datetime import date

import pytest

from app.modules.care_forms.context import MissingProfileField, build_context, patient_from_agreement, tracker_context
from app.modules.care_forms.render import FORM_IDS, render_html, template_for
from tests.care_forms_sample import BABY, MAMA, NURSE, ORG

WEEK = date(2026, 11, 16)


def test_all_forms_render_with_profile_data():
    for fid in FORM_IDS:
        html = render_html(template_for(fid), build_context(fid, patient=MAMA, author=NURSE, org=ORG))
        assert "{{" not in html and "{%" not in html
        assert "{ org." not in html  # header city/phone must be rendered, not printed as literal braces


def test_contact_details_prefill_form_01():
    html = render_html(template_for("01"), build_context("01", patient=MAMA, author=NURSE, org=ORG))
    assert "12 Ntinda Road" in html and "Luganda" in html


def test_unmc_required_and_licence_checked():
    with pytest.raises(MissingProfileField):
        build_context("03", patient=MAMA, author={**NURSE, "unmc_number": ""}, org=ORG)
    with pytest.raises(MissingProfileField):
        build_context("03", patient=MAMA, author={**NURSE, "unmc_licence_expiry": date(2020, 1, 1)}, org=ORG)
    with pytest.raises(MissingProfileField):
        build_context("03", patient=MAMA, author={**NURSE, "unmc_licence_expiry": None}, org=ORG)


def test_trackers_only_for_matching_patient_type():
    entries = [{"date": date(2026, 11, 17), "slot": "AM", "values": {"temp": "36.8"}, "initials": "AN"}]
    ctx = tracker_context("baby", WEEK, patient=BABY, partner=MAMA, author=NURSE, org=ORG, entries=entries)
    assert len(ctx["rows"]) == 14 and "36.8" in render_html("tracker-baby.html.j2", ctx)
    with pytest.raises(ValueError):
        tracker_context("baby", WEEK, patient={**MAMA, "type": "General"}, partner=MAMA, author=NURSE, org=ORG, entries=[])


def test_maternal_note_only_for_mama_or_baby():
    note = "Maternal / newborn care"
    assert note in render_html(template_for("02"), build_context("02", patient=MAMA, author=NURSE, org=ORG))
    assert note not in render_html(template_for("02"), build_context("02", patient={**MAMA, "type": "General"}, author=NURSE, org=ORG))


def test_patient_details_from_agreement_with_overrides():
    F = lambda v: {"value": v}  # noqa: E731  (same shape as AgreementField)
    ag = {"reference": "AG-1", "fields": {
        "patient__full_name": F("Mary Kisakye"), "patient__dob_or_age": F("29"), "patient__language": F("Luganda"),
        "client__phone": F("0700 000 111"), "client__email": F("mary@example.com"),
        "schedule_a__service_address": F("12 Ntinda Road"), "schedule_a__directions": F("Blue gate"),
        "schedule_a__emergency_contact": F("John, husband, 0700 000 222"), "schedule_a__treating_practitioner": F("Dr Okello"),
        "schedule_a__preferred_receiving_facility": F("Nsambya")}}
    pt = patient_from_agreement({"id": "C1", "display_name": "Mary K"}, ag, "Mama", overrides={"phone": "0700 999 999"})
    assert pt["type"] == "Mama" and pt["phone"] == "0700 999 999" and pt["language"] == "Luganda"
    html = render_html(template_for("01"), build_context("01", patient=pt, author=NURSE, org=ORG))
    assert "0700 999 999" in html and "John, husband" in html and "Dr Okello" in html and "Blue gate" in html
    assert ag["fields"]["client__phone"]["value"] == "0700 000 111"  # agreement untouched
