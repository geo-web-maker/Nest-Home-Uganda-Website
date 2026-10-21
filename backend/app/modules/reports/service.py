"""Read-only report summaries and CSV/XLSX export helpers."""

import csv
import io
from datetime import date, datetime
from typing import Any, Literal
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

from beanie import PydanticObjectId

from app.core import db
from app.core.deps import Principal
from app.core.reporting import date_range, display_action, local_month_window
from app.modules.audit import service as audit
from app.modules.audit.models import AuditLog
from app.modules.auth.models import User
from app.modules.enquiries.models import Enquiry
from app.modules.reports.schemas import MostRequestedService, ReportsSummary

ReportType = Literal["enquiries", "applications", "activity"]
ExportFormat = Literal["csv", "xlsx"]


def _utc_iso(value: Any) -> str:
    return value.isoformat() if isinstance(value, datetime) else str(value or "")


def _obj_id(value: Any) -> str:
    return str(value) if value is not None else ""


async def _aggregate(collection: Any, pipeline: list[dict]) -> list[dict]:
    cursor = collection.aggregate(pipeline)
    return [item async for item in cursor]


async def summary(now: datetime | None = None) -> ReportsSummary:
    _, month_start, next_month_start = local_month_window(now)
    month_filter = {
        "created_at": {"$gte": month_start, "$lt": next_month_start},
        "status": {"$ne": "spam"},
    }
    enquiries = Enquiry.get_pymongo_collection()
    applications = db.get_database()["applications"]
    total = await enquiries.count_documents(month_filter)
    reached_filter = {
        **month_filter,
        "$or": [
            {"status": {"$in": ["assessment_booked", "care_started"]}},
            {"events": {"$elemMatch": {
                "kind": "status_change",
                "data.to": {"$in": ["assessment_booked", "care_started"]},
                "at": {"$gte": month_start, "$lt": next_month_start},
            }}},
        ],
    }
    reached = await enquiries.count_documents(reached_filter)
    percent = round(100 * reached / total) if total else 0

    reply_rows = await _aggregate(
        enquiries,
        [
            {"$match": {**month_filter, "first_contacted_at": {"$ne": None}}},
            {"$group": {"_id": None, "minutes": {"$avg": {
                "$divide": [{"$subtract": ["$first_contacted_at", "$created_at"]}, 60000]
            }}}},
        ],
    )
    average = (
        round(reply_rows[0]["minutes"])
        if reply_rows and reply_rows[0].get("minutes") is not None
        else None
    )
    applications_count = await applications.count_documents(
        {"created_at": {"$gte": month_start, "$lt": next_month_start}}
    )
    service_groups = await _aggregate(
        enquiries,
        [
            {"$match": month_filter},
            {"$unwind": "$services"},
            {"$group": {"_id": "$services.name_snapshot", "count": {"$sum": 1}}},
            {"$sort": {"count": -1, "_id": 1}},
        ],
    )
    request_total = sum(int(item["count"]) for item in service_groups)
    most_requested = [
        MostRequestedService(
            name=str(item.get("_id") or ""),
            count=int(item["count"]),
            percentage=round(100 * int(item["count"]) / request_total) if request_total else 0,
        )
        for item in service_groups[:4]
    ]
    return ReportsSummary(
        enquiries_this_month=total,
        reached_assessment_percent=percent,
        average_first_reply_minutes=average,
        applications_count=applications_count,
        most_requested_services=most_requested,
    )


def _excel_column(number: int) -> str:
    out = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        out = chr(65 + remainder) + out
    return out


def _xlsx(headers: list[str], rows: list[list[Any]]) -> bytes:
    """Create a minimal valid .xlsx workbook using the standard library only."""
    def cell(reference: str, value: Any) -> str:
        text = (
            ""
            if value is None
            else _utc_iso(value)
            if isinstance(value, datetime)
            else str(value)
        )
        return (
            f'<c r="{reference}" t="inlineStr"><is><t xml:space="preserve">{escape(text)}'
            "</t></is></c>"
        )

    all_rows = [headers, *rows]
    row_xml = []
    for row_number, values in enumerate(all_rows, start=1):
        cells = "".join(
            cell(f"{_excel_column(column_number)}{row_number}", value)
            for column_number, value in enumerate(values, start=1)
        )
        row_xml.append(f'<row r="{row_number}">{cells}</row>')
    sheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(row_xml)}</sheetData></worksheet>'
    )
    files = {
        "[Content_Types].xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" '
            'ContentType="application/vnd.openxmlformats-package/relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.'
            'sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.'
            'worksheet+xml"/>'
            '</Types>'
        ),
        "_rels/.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
            'officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>'
        ),
        "xl/workbook.xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>'
        ),
        "xl/_rels/workbook.xml.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
            'Target="worksheets/sheet1.xml"/>'
            '</Relationships>'
        ),
        "xl/worksheets/sheet1.xml": sheet,
    }
    stream = io.BytesIO()
    with ZipFile(stream, "w", ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return stream.getvalue()


async def _user_names(user_ids: set[PydanticObjectId]) -> dict[str, str]:
    if not user_ids:
        return {}
    users = await User.find({"_id": {"$in": list(user_ids)}}).to_list()
    return {str(user.id): user.name for user in users}


async def export_rows(
    report_type: ReportType, start: date | None, end: date | None
) -> tuple[list[str], list[list[Any]]]:
    filters = date_range(start, end)
    if report_type == "enquiries":
        query = {**filters, "status": {"$ne": "spam"}}
        docs = await Enquiry.find(query).sort("-created_at").to_list()
        headers = [
            "Reference", "Name", "Phone", "Relationship", "Services", "Area", "Status", "Created"
        ]
        rows = [
            [
                doc.reference,
                doc.name,
                doc.phone_raw,
                doc.relationship,
                ", ".join(item.name_snapshot for item in doc.services),
                doc.area,
                doc.status,
                _utc_iso(doc.created_at),
            ]
            for doc in docs
        ]
        return headers, rows

    if report_type == "applications":
        docs = (
            await db.get_database()["applications"]
            .find(filters)
            .sort("created_at", -1)
            .to_list()
        )
        headers = ["Name", "Email", "Phone", "Job ID", "Stage", "Area", "Applied"]
        rows = [
            [
                doc.get("name", ""),
                doc.get("email", ""),
                doc.get("phone_e164", ""),
                _obj_id(doc.get("job_id")),
                doc.get("stage", ""),
                doc.get("area", ""),
                _utc_iso(doc.get("created_at")),
            ]
            for doc in docs
        ]
        return headers, rows

    activity_query = date_range(start, end, "at")
    docs = await AuditLog.find(activity_query).sort("-at").to_list()
    names = await _user_names({doc.user_id for doc in docs if doc.user_id is not None})
    headers = ["When", "User", "Action", "Item type", "Item"]
    rows = [
        [
            _utc_iso(doc.at),
            names.get(str(doc.user_id), "System") if doc.user_id else "System",
            display_action(doc.action, doc.item_type, doc.before, doc.after, doc.item_label),
            doc.item_type,
            doc.item_label or "",
        ]
        for doc in docs
    ]
    return headers, rows


async def export_report(
    principal: Principal,
    report_type: ReportType,
    start: date | None,
    end: date | None,
    fmt: ExportFormat,
    ip_hash: str | None,
) -> tuple[bytes, str, str]:
    if start and end and end < start:
        from app.core.errors import ValidationFailed

        raise ValidationFailed(
            "The end date must not be before the start date.", {"to": "invalid range"}
        )
    headers, rows = await export_rows(report_type, start, end)
    if fmt == "csv":
        stream = io.StringIO(newline="")
        writer = csv.writer(stream)
        writer.writerow(headers)
        writer.writerows(rows)
        content = stream.getvalue().encode("utf-8-sig")
        media_type = "text/csv; charset=utf-8"
    else:
        content = _xlsx(headers, rows)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    await audit.record(
        principal,
        "reports.export",
        "report",
        report_type,
        f"{report_type}.{fmt}",
        after={"type": report_type, "format": fmt, "from": str(start) if start else None,
               "to": str(end) if end else None, "rows": len(rows)},
        ip_hash=ip_hash,
    )
    return content, media_type, f"{report_type}.{fmt}"
