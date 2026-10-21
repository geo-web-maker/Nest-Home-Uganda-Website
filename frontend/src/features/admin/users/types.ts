// TODO(gen-types): replace with generated types
export type ScopeInfo = { id: string; group: string; label: string };
export type AdminUser = {
  id: string;
  name: string;
  email: string;
  scopes: string[];
  is_superadmin: boolean;
  last_login: string | null;
  status: 'active' | 'invited';
  active: boolean;
};
export type AdminUserPage = { items: AdminUser[]; total: number; page: number; page_size: number };
export type UserInvite = { name: string; email: string; scopes: string[] };
export type UserUpdate = { scopes?: string[]; active?: boolean };
