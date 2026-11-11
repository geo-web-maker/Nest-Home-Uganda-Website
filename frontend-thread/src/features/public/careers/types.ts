// TODO(gen-types): replace with generated types
export type JobPublic = {
  id: string;
  title: string;
  department: 'clinical' | 'care' | 'admin';
  location: string;
  type: 'full_time' | 'part_time' | 'contract';
  description: string;
  requirements: string;
  closes_on: string | null;
  registration_required: boolean;
};
