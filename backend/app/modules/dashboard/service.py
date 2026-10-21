"""Read-only dashboard aggregates backed by enquiries, applications and jobs."""

from datetime import UTC, datetime, timedelta
from typing import Any

from beanie import PydanticObjectId

from app.core import db
from app.core.config import get_settings
from app.core.reporting import business_timezone, local_month_window, start_of_local_day
from app.modules.dashboard.schemas import (
    ApplicationsWaitingByJob,
    DashboardOut,
    DashboardStats,
    EnquiriesPerDay,
    NeedsReplyItem,
)
from app.modules.enquiries.models import Enquiry
from app.modules.jobs.models import Job

_PENDING_APPLICATION_STAGES = ["received", "shortlisted", "interview", "checks", "offer"]


async def _aggregate(collection: Any, pipeline: list[dict]) -> list[dict]:
    cursor = collection.aggregate(pipeline)
    return [item async for item in cursor]


async def get_dashboard(now: datetime | None = None) -> DashboardOut:
    now_utc = (now or datetime.now(UTC)).astimezone(UTC)
    tz = business_timezone()
    local_now = now_utc.astimezone(tz)
    today = local_now.date()
    tomorrow = start_of_local_day(today + timedelta(days=1))
    week_start_date = today - timedelta(days=today.weekday())
    week_start = start_of_local_day(week_start_date)
    _, month_start, next_month_start = local_month_window(now_utc)
    runtime = get_settings()
    reminder_minutes = runtime.notify_reminder_minutes
    cutoff = now_utc - timedelta(minutes=reminder_minutes)

    new_this_week = await Enquiry.find(
        {"status": "new", "created_at": {"$gte": week_start}}
    ).count()
    unanswered = await Enquiry.find({"status": "new", "created_at": {"$lte": cutoff}}).count()
    care_started = await Enquiry.find(
        {
            "$or": [
                {
                    "events": {
                        "$elemMatch": {
                            "kind": "status_change",
                            "data.to": "care_started",
                            "at": {"$gte": month_start, "$lt": next_month_start},
                        }
                    }
                },
                {
                    "status": "care_started",
                    "updated_at": {"$gte": month_start, "$lt": next_month_start},
                },
            ]
        }
    ).count()

    applications = db.get_database()["applications"]
    waiting_filter = {"stage": {"$in": _PENDING_APPLICATION_STAGES}}
    applications_waiting = await applications.count_documents(waiting_filter)

    seven_days_ago = today - timedelta(days=6)
    chart_start = start_of_local_day(seven_days_ago)
    day_counts = await _aggregate(
        Enquiry.get_pymongo_collection(),
        [
            {
                "$match": {
                    "created_at": {"$gte": chart_start, "$lt": tomorrow},
                    "status": {"$ne": "spam"},
                }
            },
            {
                "$group": {
                    "_id": {
                        "$dateToString": {
                            "format": "%Y-%m-%d",
                            "date": "$created_at",
                            "timezone": str(tz),
                        }
                    },
                    "count": {"$sum": 1},
                }
            },
        ],
    )
    by_day = {str(item["_id"]): int(item["count"]) for item in day_counts}
    chart = [
        EnquiriesPerDay(
            date=(seven_days_ago + timedelta(days=offset)).isoformat(),
            count=by_day.get((seven_days_ago + timedelta(days=offset)).isoformat(), 0),
        )
        for offset in range(7)
    ]

    needs_reply_docs = await Enquiry.find({"status": "new"}).sort("created_at").limit(8).to_list()
    needs_reply = [
        NeedsReplyItem(
            id=str(doc.id),
            name=doc.name,
            service=doc.services[0].name_snapshot if doc.services else "",
            area=doc.area,
            status=doc.status,
        )
        for doc in needs_reply_docs
    ]

    groups = await _aggregate(
        applications,
        [
            {"$match": waiting_filter},
            {"$group": {"_id": {"$ifNull": ["$job_id", "general"]}, "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ],
    )
    ids: list[PydanticObjectId] = []
    for group in groups:
        value = group.get("_id")
        if value != "general" and PydanticObjectId.is_valid(str(value)):
            ids.append(PydanticObjectId(str(value)))
    jobs_by_id: dict[str, Job] = {}
    if ids:
        jobs = await Job.find({"_id": {"$in": ids}, "deleted_at": None}).to_list()
        jobs_by_id = {str(job.id): job for job in jobs}
    waiting_by_job: list[ApplicationsWaitingByJob] = []
    for group in groups:
        value = group.get("_id")
        job_id = str(value) if value != "general" else "general"
        job = jobs_by_id.get(job_id)
        title = (
            (job.title.get("en") or next(iter(job.title.values()), "Job"))
            if job
            else "General interest"
        )
        waiting_by_job.append(
            ApplicationsWaitingByJob(job_id=job_id, job_title=title, count=int(group["count"]))
        )

    return DashboardOut(
        stats=DashboardStats(
            new_enquiries_this_week=new_this_week,
            unanswered_over_reminder_minutes=unanswered,
            applications_waiting=applications_waiting,
            care_started_this_month=care_started,
            reminder_minutes=reminder_minutes,
        ),
        enquiries_per_day=chart,
        needs_reply=needs_reply,
        applications_waiting_by_job=waiting_by_job,
    )
