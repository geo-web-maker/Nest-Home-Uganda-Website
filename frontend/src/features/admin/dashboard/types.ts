// TODO(gen-types): replace with generated types
export type DashboardData = {
  stats: {
    new_enquiries_this_week: number;
    unanswered_over_reminder_minutes: number;
    applications_waiting: number;
    care_started_this_month: number;
    reminder_minutes: number;
  };
  enquiries_per_day: Array<{ date: string; count: number }>;
  needs_reply: Array<{ id: string; name: string; service: string; area: string; status: string }>;
  applications_waiting_by_job: Array<{ job_id: string; job_title: string; count: number }>;
};
