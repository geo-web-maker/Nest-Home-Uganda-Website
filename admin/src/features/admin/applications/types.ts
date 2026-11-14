// TODO(gen-types): replace with generated types
export type ApplicationStage =
  'received' | 'shortlisted' | 'interview' | 'checks' | 'offer' | 'hired' | 'declined';
export type ApplicationItem = {
  id: string;
  name: string;
  job_id: string | null;
  job_title: string;
  experience_years: number;
  stage: ApplicationStage;
  rating: number | null;
  applied_at: string;
};
export type ApplicationDetail = ApplicationItem & {
  phone_e164: string;
  email: string;
  registration_number: string;
  qualification: string;
  area: string;
  availability: string;
  cover_note: string;
  cv_file_name: string;
  cv_available: boolean;
  decline_reason: string | null;
  answers: Record<string, string>;
  events: Array<{ at: string; text: string; user_name: string | null }>;
};
export type ApplicationPage = {
  items: ApplicationItem[];
  total: number;
  page: number;
  page_size: number;
};
export type ApplicationUpdate = {
  stage?: ApplicationStage;
  rating?: number | null;
  decline_reason?: string | null;
};
export type ApplicationNote = { text: string };
export type CvLink = { url: string; expires_at: string };
