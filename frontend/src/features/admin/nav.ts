import type { UserPublic } from '../../types';
import { hasScopes } from './auth/hasScopes';

type Access = Pick<UserPublic, 'scopes' | 'is_superadmin'>;

export type AdminNavItem = {
  path: string;
  /** Key under `nav` in locales/en/admin.ts. */
  labelKey: string;
  /** A user needs all of these (spec 12.3). */
  scopes: readonly string[];
  /** Key into `icons.tsx`. */
  icon: string;
  /** Sidebar group (spec 4.19 names the groups "Work" and "Manage" but not their members). */
  group: 'work' | 'manage';
};

/** The one list of admin routes, in spec 7.1 navigation order. Detail routes use their list's entry. */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  {
    path: '/admin',
    labelKey: 'dashboard',
    scopes: ['dashboard:view'],
    icon: 'dashboard',
    group: 'work',
  },
  {
    path: '/admin/enquiries',
    labelKey: 'enquiries',
    scopes: ['enquiries:read'],
    icon: 'enquiries',
    group: 'work',
  },
  {
    path: '/admin/careers',
    labelKey: 'careers',
    scopes: ['jobs:read'],
    icon: 'careers',
    group: 'work',
  },
  {
    path: '/admin/applications',
    labelKey: 'applications',
    scopes: ['applications:read'],
    icon: 'applications',
    group: 'work',
  },
  {
    path: '/admin/content',
    labelKey: 'content',
    scopes: ['content:read'],
    icon: 'content',
    group: 'work',
  },
  {
    path: '/admin/settings',
    labelKey: 'settings',
    scopes: ['settings:read'],
    icon: 'settings',
    group: 'manage',
  },
  {
    path: '/admin/users',
    labelKey: 'users',
    scopes: ['users:read'],
    icon: 'users',
    group: 'manage',
  },
  {
    path: '/admin/care',
    labelKey: 'care',
    scopes: ['clients:read'],
    icon: 'dashboard',
    group: 'manage',
  },
  {
    path: '/admin/reports',
    labelKey: 'reports',
    scopes: ['reports:read'],
    icon: 'reports',
    group: 'manage',
  },
  {
    path: '/admin/activity',
    labelKey: 'activity',
    scopes: ['activity:read'],
    icon: 'activity',
    group: 'manage',
  },
];

const BOTTOM_NAV_SLOTS = 4;

/** Scopes a route needs. Throws for a path not in the list, so a typo in route config fails loudly. */
export function scopesFor(path: string): readonly string[] {
  const item = ADMIN_NAV.find((entry) => entry.path === path);
  if (!item) throw new Error(`No admin nav entry for ${path}`);
  return item.scopes;
}

function canReach(item: AdminNavItem, user: Access | null): boolean {
  if (item.path === '/admin/settings') {
    return hasScopes(user, item.scopes) || hasScopes(user, ['system:manage']);
  }
  return hasScopes(user, item.scopes);
}

export function visibleNav(user: Access | null): AdminNavItem[] {
  return ADMIN_NAV.filter((item) => canReach(item, user));
}

/** Phone bottom nav: the first four reachable items; the rest go under "More". */
export function bottomNav(user: Access | null): { primary: AdminNavItem[]; more: AdminNavItem[] } {
  const items = visibleNav(user);
  return { primary: items.slice(0, BOTTOM_NAV_SLOTS), more: items.slice(BOTTOM_NAV_SLOTS) };
}

export function firstReachablePath(user: Access | null): string | null {
  return visibleNav(user)[0]?.path ?? null;
}
