from app.modules.field.schemas import FieldVisitResponse


def test_field_payload_schema_is_explicit_and_minimal():
    assert set(FieldVisitResponse.model_fields) == {
        "id",
        "client_display_name",
        "place_address_text",
        "lat",
        "lng",
        "scheduled_start",
        "scheduled_end",
        "status",
        "instructions",
        "adhoc",
        "check_in_at",
        "check_out_at",
        "verification_label",
        "photo_count",
        "photo_types",
        "photo_rules",
        "safety_state",
    }
    assert "distance_m" not in FieldVisitResponse.model_fields
    assert "flag_types" not in FieldVisitResponse.model_fields


def test_adhoc_policy_helpers_do_not_accept_free_text_client_identity():
    from app.modules.field.router import AdhocVisitIn

    fields = set(AdhocVisitIn.model_fields)
    assert fields == {
        "id",
        "client_op_id",
        "client_id",
        "device_time",
        "sent_at_device",
        "lat",
        "lng",
        "accuracy_m",
        "source",
        "device_info",
    }
    assert "client_name" not in fields
    assert "client_display_name" not in fields
