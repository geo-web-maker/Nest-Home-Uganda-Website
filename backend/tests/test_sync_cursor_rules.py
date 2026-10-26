import base64
import json
from datetime import UTC, datetime, timedelta

from app.modules.field.sync_cursor import decode_cursor, encode_cursor, is_after_cursor


def test_cursor_round_trips_utc_timestamp_and_key():
    timestamp = datetime(2026, 10, 25, 12, 30, tzinfo=UTC)
    cursor = encode_cursor(timestamp, "visit:visit-00000001")

    assert decode_cursor(cursor) == (timestamp, "visit:visit-00000001")


def test_cursor_normalises_naive_datetime_to_utc():
    timestamp = datetime(2026, 10, 25, 12, 30)

    assert decode_cursor(encode_cursor(timestamp, "visit:visit-00000001")) == (
        timestamp.replace(tzinfo=UTC),
        "visit:visit-00000001",
    )


def test_invalid_cursor_is_treated_as_start_of_pull():
    assert decode_cursor("not-a-cursor") is None
    assert decode_cursor("") is None
    assert decode_cursor(None) is None
    malformed_prefix = (
        base64.urlsafe_b64encode(
            json.dumps(
                {"updated_at": "2026-10-25T12:30:00+00:00", "key": "unexpected:key"}
            ).encode()
        )
        .decode()
        .rstrip("=")
    )
    assert decode_cursor(malformed_prefix) is None


def test_cursor_order_uses_key_to_break_equal_timestamp_ties():
    timestamp = datetime(2026, 10, 25, 12, 30, tzinfo=UTC)
    cursor = decode_cursor(encode_cursor(timestamp, "visit:b"))

    assert is_after_cursor(timestamp, "visit:c", cursor)
    assert not is_after_cursor(timestamp, "visit:a", cursor)
    assert is_after_cursor(timestamp + timedelta(microseconds=1), "visit:a", cursor)
