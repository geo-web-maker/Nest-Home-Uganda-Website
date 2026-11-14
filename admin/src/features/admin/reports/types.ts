// TODO(gen-types): replace with generated types
export type ReportsSummary = {
  enquiries_this_month: number;
  reached_assessment_percent: number;
  average_first_reply_minutes: number | null;
  applications_count: number;
  most_requested_services: Array<{ name: string; count: number; percentage: number }>;
};
export type ExportType = 'enquiries' | 'applications' | 'activity';
export type ExportFormat = 'csv' | 'xlsx';
