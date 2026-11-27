export type AgreementOwner = 'staff' | 'clinical' | 'client' | 'either';

export type AgreementField = {
  value: unknown;
  owner: AgreementOwner;
  revision: number;
  entered_by_staff: boolean;
  updated_at?: string | null;
  updated_by?: string | null;
};

export type FieldConflict = {
  local: string;
  remote: string;
  revision: number;
};
