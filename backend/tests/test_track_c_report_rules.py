from datetime import UTC, datetime

import pytest

from app.modules.care_admin.report_rules import decode_report_cursor, encode_report_cursor
from app.modules.care_ops.rules import csv_safe


def test_report_cursor_round_trips_timezone_timestamp_and_id():
    stamp = datetime(2026, 10, 26, 8, 30, tzinfo=UTC)
    assert decode_report_cursor(encode_report_cursor(stamp, "visit-123456")) == (
        stamp,
        "visit-123456",
    )


def test_report_cursor_rejects_malformed_or_naive_values():
    for value in ("!", "", "bm90LWFuLWRhdGU=", "MjAyNi0xMC0yNlQwODowMDowMHx2aXNpdC0x"):
        with pytest.raises(ValueError):
            decode_report_cursor(value)


def test_csv_export_escapes_every_formula_prefix():
    for value in ("=1+1", "+cmd", "-cmd", "@cmd"):
        assert csv_safe(value).startswith("'")
