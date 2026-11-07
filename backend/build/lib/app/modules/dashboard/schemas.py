from pydantic import BaseModel


class DashboardStats(BaseModel):
    new_enquiries_this_week: int
    unanswered_over_reminder_minutes: int
    applications_waiting: int
    care_started_this_month: int
    reminder_minutes: int


class EnquiriesPerDay(BaseModel):
    date: str
    count: int


class NeedsReplyItem(BaseModel):
    id: str
    name: str
    service: str
    area: str
    status: str


class ApplicationsWaitingByJob(BaseModel):
    job_id: str
    job_title: str
    count: int


class DashboardOut(BaseModel):
    stats: DashboardStats
    enquiries_per_day: list[EnquiriesPerDay]
    needs_reply: list[NeedsReplyItem]
    applications_waiting_by_job: list[ApplicationsWaitingByJob]
