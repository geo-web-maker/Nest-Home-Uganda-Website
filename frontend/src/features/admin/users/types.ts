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
  kind: string;
  reach: 'own' | 'team' | 'all';
};
export type AdminUserPage = { items: AdminUser[]; total: number; page: number; page_size: number };
export type UserInvite = {
  name: string;
  email: string;
  scopes: string[];
  preset?: 'nurse' | 'supervisor' | 'admin' | 'executive' | 'super_admin';
  kind: 'staff' | 'nurse' | 'supervisor' | 'admin' | 'executive';
  reach: 'own' | 'team' | 'all';
  phone?: string;
  delivery: Delivery[];
};
export type Delivery = 'email' | 'sms' | 'temp_password';
export type Issued = {
  temp_password?: string | null;
  delivered?: Record<string, string>;
};
export type AdminUserIssued = AdminUser & Issued;
export type UserUpdate = {
  scopes?: string[];
  active?: boolean;
  kind?: 'staff' | 'nurse' | 'supervisor' | 'admin' | 'executive';
  reach?: 'own' | 'team' | 'all';
};
