"""Dashboard, reporting and activity integration tests; uses the MongoDB fixture."""

from datetime import UTC, datetime, timedelta

import httpx
from beanie import PydanticObjectId

from app.modules.audit.models import AuditLog
from app.modules.enquiries.models import Enquiry, EnquiryEvent, EnquiryService
from app.modules.jobs.models import Job
from tests.conftest import auth, make_token

DASHBOARD = "/api/v1/admin/dashboard"
SUMMARY = "/api/v1/admin/reports/summary"
EXPORT = "/api/v1/admin/reports/export"
ACTIVITY = "/api/v1/admin/activity"


def scoped(*scopes: str) -> dict[str, str]:
    return auth(make_token(list(scopes)))


async def make_enquiry(status: str, reference: str, *, reply_minutes: int) -> Enquiry:
    now = datetime.now(UTC)
    events = []
    if status == "care_started":
        events = [
            EnquiryEvent(
                at=now,
                kind="status_change",
                data={"from": "assessment_booked", "to": "care_started"},
                text="Changed status to Care started",
            )
        ]
    item = Enquiry(
        reference=reference,
        name=f"Person {reference}",
        phone_raw="0787 499 988",
        phone_e164="+256787499988",
        relationship="self",
        services=[
            EnquiryService(service_id=PydanticObjectId("a" * 24), name_snapshot="Home nursing")
        ],
        area="Kampala",
        status=status,
        events=events,
    )
    await item.insert()
    # Insert hook stamps created_at=now, so set the first reply after it.
    item.first_contacted_at = item.created_at + timedelta(minutes=reply_minutes)
    await item.save()
    return item


async def test_dashboard_and_report_summaries_use_live_aggregates(
    mongo: object, client: httpx.AsyncClient
) -> None:
    new = await make_enquiry("new", "NH-TEST-001", reply_minutes=10)
    await make_enquiry("care_started", "NH-TEST-002", reply_minutes=20)
    job = Job(title={"en": "Registered Nurse"}, location="Kampala", department="clinical")
    await job.insert()
    now = datetime.now(UTC)
    await mongo["applications"].insert_one(
        {
            "name": "Applicant One",
            "email": "applicant@example.test",
            "phone_e164": "+256701000111",
            "job_id": job.id,
            "stage": "received",
            "area": "Kampala",
            "created_at": now,
            "experience_years": 4,
        }
    )

    dashboard = await client.get(DASHBOARD, headers=scoped("dashboard:view"))
    assert dashboard.status_code == 200
    dashboard_data = dashboard.json()
    assert dashboard_data["stats"]["new_enquiries_this_week"] == 1
    assert dashboard_data["stats"]["applications_waiting"] == 1
    assert dashboard_data["stats"]["care_started_this_month"] == 1
    assert len(dashboard_data["enquiries_per_day"]) == 7
    assert sum(row["count"] for row in dashboard_data["enquiries_per_day"]) == 2
    assert dashboard_data["needs_reply"][0]["id"] == str(new.id)
    assert dashboard_data["applications_waiting_by_job"][0]["job_title"] == "Registered Nurse"

    summary = await client.get(SUMMARY, headers=scoped("reports:read"))
    assert summary.status_code == 200
    report = summary.json()
    assert report["enquiries_this_month"] == 2
    assert report["reached_assessment_percent"] == 50
    assert report["average_first_reply_minutes"] in {15, 16}
    assert report["applications_count"] == 1
    assert report["most_requested_services"] == [
        {"name": "Home nursing", "count": 2, "percentage": 100}
    ]


async def test_report_exports_are_downloadable_and_appear_in_activity(
    mongo: object, client: httpx.AsyncClient
) -> None:
    await make_enquiry("new", "NH-EXPORT-001", reply_minutes=4)
    headers = scoped("reports:export")
    csv_response = await client.get(f"{EXPORT}?type=enquiries&format=csv", headers=headers)
    assert csv_response.status_code == 200
    assert "text/csv" in csv_response.headers["content-type"]
    assert "Reference" in csv_response.text and "NH-EXPORT-001" in csv_response.text
    assert csv_response.headers["content-disposition"].endswith('filename="enquiries.csv"')

    xlsx_response = await client.get(f"{EXPORT}?type=activity&format=xlsx", headers=headers)
    assert xlsx_response.status_code == 200
    assert "spreadsheetml.sheet" in xlsx_response.headers["content-type"]
    assert xlsx_response.content.startswith(b"PK")
    exports = await AuditLog.find(AuditLog.action == "reports.export").count()
    assert exports == 2

    activity = await client.get(ACTIVITY, headers=scoped("activity:read"))
    assert activity.status_code == 200
    labels = [item["action"] for item in activity.json()["items"]]
    assert "Exported enquiries.csv" in labels
    assert "Exported activity.xlsx" in labels


async def test_date_filters_reject_reversed_ranges(
    mongo: object, client: httpx.AsyncClient
) -> None:
    headers = scoped("activity:read")
    response = await client.get(f"{ACTIVITY}?from=2026-10-20&to=2026-10-01", headers=headers)
    assert response.status_code == 422
