"""Shared date/activity helpers and standard-library XLSX output."""

import io
from datetime import date, datetime
from xml.etree import ElementTree
from zipfile import ZipFile

from app.core.reporting import date_range, display_action
from app.modules.reports.service import _xlsx


def test_date_range_uses_inclusive_local_calendar_days() -> None:
    query = date_range(date(2026, 10, 1), date(2026, 10, 2))
    assert set(query) == {"created_at"}
    bounds = query["created_at"]
    assert bounds["$gte"].tzinfo is not None
    assert bounds["$lt"] > bounds["$gte"]
    assert date_range(None, None) == {}


def test_activity_actions_are_human_readable() -> None:
    assert (
        display_action(
            "enquiry.update", "enquiry", {"status": "new"}, {"status": "contacted"}, "Mary"
        )
        == "Changed status to Contacted"
    )
    assert display_action("settings.update", "settings") == "Changed site settings"
    assert display_action("job.publish", "job") == "Published job"


def test_xlsx_export_is_a_well_formed_workbook_with_escaped_text() -> None:
    payload = _xlsx(["Name", "Created"], [["Nurse & carer", datetime(2026, 10, 20, 12, 0)]])
    with ZipFile(io.BytesIO(payload)) as archive:
        assert archive.testzip() is None
        worksheet = ElementTree.fromstring(archive.read("xl/worksheets/sheet1.xml"))  # noqa: S314
    texts = [node.text for node in worksheet.iter() if node.tag.endswith("}t")]
    assert texts == ["Name", "Created", "Nurse & carer", "2026-10-20T12:00:00"]
