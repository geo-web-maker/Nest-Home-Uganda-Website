// TODO(gen-types): replace with generated types
export type LocalizedText = Record<string, string>;
export type JobType = 'full_time' | 'part_time' | 'contract';
export type JobDepartment = 'clinical' | 'care' | 'admin';
export type JobAdmin = {
  id: string;
  title: LocalizedText;
  department: JobDepartment;
  location: string;
  type: JobType;
  description: LocalizedText;
  requirements: LocalizedText;
  closes_on: string | null;
  registration_required: boolean;
  show_closing: boolean;
  published: boolean;
  closed_at: string | null;
  applicants_count: number;
  created_at?: string;
  updated_at?: string;
};
export type JobInput = {
  title: string;
  department: JobDepartment;
  location: string;
  type: JobType;
  description: string;
  requirements: string;
  closes_on: string | null;
  registration_required: boolean;
  show_closing: boolean;
  published: boolean;
};
export type JobPage = { items: JobAdmin[]; total: number; page: number; page_size: number };
