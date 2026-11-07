from pydantic import BaseModel


class MostRequestedService(BaseModel):
    name: str
    count: int
    percentage: int


class ReportsSummary(BaseModel):
    enquiries_this_month: int
    reached_assessment_percent: int
    average_first_reply_minutes: int | None
    applications_count: int
    most_requested_services: list[MostRequestedService]
