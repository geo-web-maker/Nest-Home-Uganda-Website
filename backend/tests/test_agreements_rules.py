"""S1/S3 unit tests for agreement ownership, hashing, fees and message safety."""

import pytest

from app.modules.agreements import messages, rules


def test_booking_fee_is_additional_to_service_fee_split_for_ugx() -> None:
    result = rules.calculate_fees("100000", "UGX")
    assert result["booking_fee"] == 50_000.0
    assert result["booking_fee_currency"] == "UGX"
    assert result["booking_fee_is_additional"] is True
    assert result["care_fee"] == 100_000.0
    assert result["total_service_fees"] == 100_000.0
    assert result["total"] == 100_000.0
    assert result["advance"] == 50_000.0
    assert result["balance"] == 50_000.0
    assert result["total_payable_if_ugx"] == 150_000.0
    assert result["currency"] == "UGX"


def test_booking_fee_and_50_50_split_for_usd() -> None:
    result = rules.calculate_fees("101", "USD")
    assert result["currency"] == "USD"
    assert result["booking_fee"] == 50_000.0
    assert result["booking_fee_currency"] == "UGX"
    assert result["total_service_fees"] == 101.0
    assert result["advance"] == 50.5
    assert result["balance"] == 50.5
    assert result["total_payable_if_ugx"] is None


def test_fees_reject_negative_or_unknown_currency() -> None:
    with pytest.raises(ValueError):
        rules.calculate_fees(-1)
    with pytest.raises(ValueError):
        rules.calculate_fees(1, "EUR")


def test_server_ownership_blocks_client_schedule_b_and_schedule_a_clinical() -> None:
    with pytest.raises(PermissionError):
        rules.validate_patch("schedule_b.total_fee", "staff", "client", False)
    with pytest.raises(PermissionError):
        rules.validate_patch("schedule_a.care_plan", "clinical", "client", False)
    with pytest.raises(PermissionError):
        rules.validate_patch("schedule_c.care_consent", "client", "staff", False)
    with pytest.raises(PermissionError):
        rules.validate_patch("schedule_a.visit_dates_frequency", "clinical", "client", False)
    with pytest.raises(PermissionError):
        rules.validate_patch("schedule_b.payment_provider_account_number", "staff", "client", False)
    with pytest.raises(PermissionError):
        rules.validate_patch("schedule_a.patient_rep_initials", "client", "staff", False)


def test_schedule_b_organisation_payer_fields_are_either_owned() -> None:
    rules.validate_patch("schedule_b.organisation_payer_name", "either", "client", False)
    rules.validate_patch("schedule_b.organisation_signatory_authority", "either", "staff", True)


def test_staff_entered_by_staff_only_for_either_fields() -> None:
    rules.validate_patch("client.name", "either", "staff", True)
    with pytest.raises(PermissionError):
        rules.validate_patch("schedule_c.initials", "client", "staff", True)
    with pytest.raises(PermissionError):
        rules.validate_patch("client.name", "either", "client", True)


def test_schedule_c_consent_and_initials_are_required_before_signing() -> None:
    fields = rules.initial_fields()
    assert set(rules.missing_signing_consent(fields)) == {
        "schedule_a.patient_rep_initials", "schedule_a.patient_rep_initials_date",
        "schedule_c.decision_maker", "schedule_c.care_consent", "schedule_c.initials",
        "schedule_c.communication_channel", "schedule_c.permissions", "schedule_c.verified_contact",
        "schedule_c.information_permitted", "schedule_c.authorized_people_scope",
    }
    for path, value in (
        ("schedule_a.patient_rep_initials", "AM"),
        ("schedule_a.patient_rep_initials_date", "2026-11-06"),
        ("schedule_c.decision_maker", "patient"),
        ("schedule_c.care_consent", "Consent reviewed"),
        ("schedule_c.initials", "AM"),
        ("schedule_c.communication_channel", "email"),
        ("schedule_c.permissions", "Care updates permitted"),
        ("schedule_c.verified_contact", "client@example.invalid"),
        ("schedule_c.information_permitted", "Agreed care updates"),
        ("schedule_c.authorized_people_scope", "Patient only"),
    ):
        fields[rules.field_key(path)] = fields[rules.field_key(path)].model_copy(update={"value": value})
    assert rules.missing_signing_consent(fields) == []


def test_lawful_representative_requires_identity_relationship_and_authority() -> None:
    fields = rules.initial_fields()
    for path, value in (
        ("schedule_a.patient_rep_initials", "AM"),
        ("schedule_a.patient_rep_initials_date", "2026-11-06"),
        ("schedule_c.decision_maker", "Parent/Guardian"),
        ("schedule_c.care_consent", "Consent reviewed"),
        ("schedule_c.initials", "AM"),
        ("schedule_c.communication_channel", "email"),
        ("schedule_c.permissions", "Care updates permitted"),
        ("schedule_c.verified_contact", "client@example.invalid"),
        ("schedule_c.information_permitted", "Agreed care updates"),
        ("schedule_c.authorized_people_scope", "Patient only"),
    ):
        fields[rules.field_key(path)] = fields[rules.field_key(path)].model_copy(update={"value": value})
    assert set(rules.missing_signing_consent(fields)) == {
        "schedule_c.representative_name", "schedule_c.representative_relationship", "schedule_c.authority_basis"
    }
    for path, value in (
        ("schedule_c.representative_name", "Amina Example"),
        ("schedule_c.representative_relationship", "Parent"),
        ("schedule_c.authority_basis", "Verified guardianship document"),
    ):
        fields[rules.field_key(path)] = fields[rules.field_key(path)].model_copy(update={"value": value})
    assert rules.missing_signing_consent(fields) == []


def test_all_staff_and_clinical_fields_must_be_filled_before_send() -> None:
    fields = rules.initial_fields()
    expected = {path for path, owner in rules.FIELD_OWNERS.items() if owner in {"staff", "clinical"}}
    assert set(rules.missing_staff_fields(fields)) == expected
    for path in expected:
        fields[rules.field_key(path)] = fields[rules.field_key(path)].model_copy(update={"value": "Not applicable"})
    assert rules.missing_staff_fields(fields) == []


def test_canonical_hash_is_order_independent_and_binds_revision_and_template() -> None:
    first = rules.initial_fields()
    second = dict(reversed(list(first.items())))
    digest = rules.canonical_hash(first, 1, "template-hash")
    assert digest == rules.canonical_hash(second, 1, "template-hash")
    changed = dict(first)
    key = rules.field_key("client.name")
    changed[key] = changed[key].model_copy(update={"value": "Amina", "revision": 1})
    assert digest != rules.canonical_hash(changed, 1, "template-hash")
    assert digest != rules.canonical_hash(first, 2, "template-hash")
    assert digest != rules.canonical_hash(first, 1, "other-template-hash")


def test_sms_gsm7_and_segment_validation() -> None:
    assert messages.is_gsm7("Bloomwell: care agreement https://bhcug.com")
    assert not messages.is_gsm7("Bloomwell: please review — thank you")
    assert messages.sms_segments("x" * 160) == 1
    assert messages.sms_segments("x" * 161) == 2
    assert messages.sms_segments("x" * 307) == 3


def test_message_templates_reject_unknown_variables_and_missing_mandatory_values() -> None:
    with pytest.raises(ValueError, match="Unknown message variable"):
        messages.validate_template("agreement_sent", "sms", {"body": "Bloomwell: {{patient_name}} {{link}}"})
    with pytest.raises(ValueError, match="include {{link}}"):
        messages.validate_template("agreement_sent", "sms", {"body": "Bloomwell: your agreement is ready"})
    with pytest.raises(ValueError, match="include {{code}}"):
        messages.validate_template("otp_sign", "sms", {"body": "Bloomwell: your code is ready"})


def test_public_link_host_is_fixed_to_bloomwell_domain() -> None:
    assert messages.public_link("test-token").startswith("https://bhcug.com/agreement/")
    with pytest.raises(ValueError):
        messages.validate_link_url("https://evil.example/agreement/token")
    with pytest.raises(ValueError):
        messages.validate_link_url("http://bhcug.com/agreement/token")


def test_template_requires_all_plan_sections() -> None:
    counts = {1: 5, 2: 3, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 8,
              9: 4, 10: 4, 11: 3, 12: 5, 13: 4, 14: 3, 15: 5}
    clauses = {f"{number}.0": f"Clause {number}" for number in range(1, 16)}
    clauses.update({f"{major}.{minor}": f"Subclause {major}.{minor}"
                    for major, count in counts.items() for minor in range(1, count + 1)})
    clauses.update({"1.1": "Contact info@bhcug.com", "14.1": "Contact info@bhcug.com",
                    "Schedule A": "Schedule A wording", "Schedule B": "Schedule B wording",
                    "Schedule C": "Schedule C wording"})
    rules.validate_template_sections(clauses)
    clauses.pop("Schedule C")
    with pytest.raises(ValueError, match="Schedule C"):
        rules.validate_template_sections(clauses)

def test_email_copy_escapes_custom_message_content() -> None:
    template = messages.DefaultMessage(subject="Agreement", body="Hello <script>alert(1)</script>", button="Review")
    _, html_body, plain = messages.render_email("notice", template, {"client_name": "Client", "link": ""})
    assert "&lt;script&gt;" in html_body
    assert "<script>" not in html_body
    assert "Hello <script>alert(1)</script>" in plain


def test_published_source_template_contains_complete_pdf_text_and_only_two_email_corrections() -> None:
    from app.modules.agreements.source_template import SOURCE_CLAUSES, SOURCE_FILE

    rules.validate_template_sections(SOURCE_CLAUSES)
    assert SOURCE_FILE.endswith(".pdf")
    assert "info@bhcug.com" in SOURCE_CLAUSES["1.1"]
    assert "info@bhcug.com" in SOURCE_CLAUSES["14.1"]
    assert "info@wellnesthomecareug.com" not in SOURCE_CLAUSES["1.1"] + SOURCE_CLAUSES["14.1"]
    assert "0787499988" in SOURCE_CLAUSES["Agreement introduction"]
    assert "+256787499988" in SOURCE_CLAUSES["14.1"]
    assert "is additional to, and is not included in calculating" in SOURCE_CLAUSES["8.4"]
    # the source text is hard-wrapped, so compare with whitespace collapsed
    assert "Illiterates Protection Act" in " ".join(SOURCE_CLAUSES["Schedule C"].split())
    assert all(f"{major}.{minor}" in SOURCE_CLAUSES
               for major, counts in ((1, range(1, 6)), (2, range(1, 4)), (3, range(1, 3)),  # the source PDF ends clause 3 at 3.2,
                                     (4, range(1, 3)), (5, range(1, 4)), (6, range(1, 5)),
                                     (7, range(1, 5)), (8, range(1, 9)), (9, range(1, 5)),
                                     (10, range(1, 5)), (11, range(1, 4)), (12, range(1, 6)),
                                     (13, range(1, 5)), (14, range(1, 4)), (15, range(1, 6)))
               for minor in counts)
