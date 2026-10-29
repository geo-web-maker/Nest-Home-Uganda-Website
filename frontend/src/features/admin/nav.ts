import type { UserPublic } from '../../types';
import { hasScopes } from './auth/hasScopes';

type Access = Pick<UserPublic, 'scopes' | 'is_superadmin'>;

export type AdminNavItem = {
  path: string;
  /** Key under `nav` in locales/en/admin.ts. */
  labelKey: string;
  /** A user needs all of these. Route guards repeat this check on the server-backed screen. */
  scopes: readonly string[];
  /** Key into `icons.tsx`. */
  icon: string;
  /** Groups follow nest-all-features-mockups.html; gated care-record screens are deliberately omitted. */
  group: 'website' | 'careOperations' | 'monitoring' | 'safety' | 'setup';
};

/**
 * The mockup's navigation is the admin IA source of truth. Only implemented screens are listed;
 * patients/medications/adherence remain gated out until those screens and their APIs exist.
 */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  // Website and administration
  { path: '/admin', labelKey: 'dashboard', scopes: ['dashboard:view'], icon: 'dashboard', group: 'website' },
  { path: '/admin/enquiries', labelKey: 'enquiries', scopes: ['enquiries:read'], icon: 'enquiries', group: 'website' },
  { path: '/admin/careers', labelKey: 'careers', scopes: ['jobs:read'], icon: 'careers', group: 'website' },
  { path: '/admin/applications', labelKey: 'applications', scopes: ['applications:read'], icon: 'applications', group: 'website' },
  { path: '/admin/content', labelKey: 'content', scopes: ['content:read'], icon: 'content', group: 'website' },
  { path: '/admin/settings', labelKey: 'settings', scopes: ['settings:read'], icon: 'settings', group: 'website' },
  { path: '/admin/users', labelKey: 'users', scopes: ['users:read'], icon: 'users', group: 'website' },
  { path: '/admin/permissions', labelKey: 'permissions', scopes: ['users:read'], icon: 'shield', group: 'website' },
  { path: '/admin/reports', labelKey: 'reports', scopes: ['reports:read'], icon: 'reports', group: 'website' },
  { path: '/admin/activity', labelKey: 'activity', scopes: ['activity:read'], icon: 'activity', group: 'website' },
  // Care operations
  { path: '/admin/care/clients', labelKey: 'clients', scopes: ['clients:read'], icon: 'home', group: 'careOperations' },
  { path: '/admin/care/places', labelKey: 'places', scopes: ['places:read'], icon: 'pin', group: 'careOperations' },
  { path: '/admin/care/nurses', labelKey: 'nurses', scopes: ['nurses:read'], icon: 'users', group: 'careOperations' },
  { path: '/admin/care/visits', labelKey: 'visits', scopes: ['visits:read'], icon: 'calendar', group: 'careOperations' },
  { path: '/admin/care/schedule', labelKey: 'schedule', scopes: ['visits:read'], icon: 'calendar', group: 'careOperations' },
  { path: '/admin/care/flags', labelKey: 'flags', scopes: ['flags:read'], icon: 'flag', group: 'careOperations' },
  { path: '/admin/care/team', labelKey: 'team', scopes: ['visits:read'], icon: 'users', group: 'careOperations' },
  // Monitoring
  { path: '/admin/care/dashboard', labelKey: 'liveDashboard', scopes: ['dashboard:view'], icon: 'dashboard', group: 'monitoring' },
  { path: '/admin/care/executive', labelKey: 'executiveCharts', scopes: ['dashboard:view'], icon: 'chart', group: 'monitoring' },
  { path: '/admin/care/map', labelKey: 'lastSeenMap', scopes: ['visits:read'], icon: 'pin', group: 'monitoring' },
  { path: '/admin/care/alerts', labelKey: 'alerts', scopes: ['alerts:read'], icon: 'bell', group: 'monitoring' },
  { path: '/admin/care/timesheets', labelKey: 'timesheets', scopes: ['timesheets:read'], icon: 'timer', group: 'monitoring' },
  { path: '/admin/care/photos', labelKey: 'photos', scopes: ['photos:read'], icon: 'photo', group: 'monitoring' },
  { path: '/admin/care/reports/visits', labelKey: 'careReports', scopes: ['care-reports:read'], icon: 'chart', group: 'monitoring' },
  { path: '/admin/care/notifications', labelKey: 'notificationLog', scopes: ['carecfg:read'], icon: 'bell', group: 'monitoring' },
  // Safety
  { path: '/admin/care/sos', labelKey: 'sos', scopes: ['alerts:read'], icon: 'alert', group: 'safety' },
  { path: '/admin/care/sos/history', labelKey: 'sosHistory', scopes: ['alerts:read'], icon: 'activity', group: 'safety' },
  { path: '/admin/care/on-call', labelKey: 'onCallRoster', scopes: ['carecfg:read'], icon: 'users', group: 'safety' },
  { path: '/admin/care/sos-procedure', labelKey: 'sosProcedure', scopes: ['carecfg:read'], icon: 'shield', group: 'safety' },
  // Setup and compliance
  { path: '/admin/care/settings', labelKey: 'careSettings', scopes: ['carecfg:read'], icon: 'gear', group: 'setup' },
  { path: '/admin/care/setting-catalogue', labelKey: 'settingCatalogue', scopes: ['carecfg:read'], icon: 'settings', group: 'setup' },
  { path: '/admin/care/data-retention', labelKey: 'dataRetention', scopes: ['carecfg:read'], icon: 'shield', group: 'setup' },
  { path: '/admin/care/sms', labelKey: 'smsSettings', scopes: ['carecfg:read'], icon: 'settings', group: 'setup' },
  { path: '/admin/care/readiness', labelKey: 'readiness', scopes: ['carecfg:read'], icon: 'check', group: 'setup' },
  { path: '/admin/care/data-requests', labelKey: 'dataRequests', scopes: ['system:manage'], icon: 'shield', group: 'setup' },
  { path: '/admin/app-releases', labelKey: 'appReleases', scopes: ['system:manage'], icon: 'download', group: 'setup' },
  { path: '/admin/backups', labelKey: 'backupsHealth', scopes: ['system:manage'], icon: 'shield', group: 'setup' },
];

/**
 * The one nav item a URL belongs to: the longest matching path. `/admin/care/sos/history` is
 * History, not SOS, while `/admin/care/sos/123` (a case) is still SOS. Prefix matching alone would
 * light both, so the sidebar, More list and bottom bar all use this instead of NavLink's own match.
 */
export function navItemFor(pathname: string): AdminNavItem | undefined {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return ADMIN_NAV.filter((item) =>
    item.path === '/admin' ? clean === '/admin' : clean === item.path || clean.startsWith(`${item.path}/`),
  ).sort((a, b) => b.path.length - a.path.length)[0];
}

const BOTTOM_NAV_SLOTS = 4;
const MOBILE_SHORTCUTS = ['/admin', '/admin/care/visits', '/admin/care/alerts', '/admin/care/sos'];

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

/** Phone shortcuts follow the reference: dashboard, visits, alerts and SOS, with scoped fallbacks. */
export function bottomNav(user: Access | null): { primary: AdminNavItem[]; more: AdminNavItem[] } {
  const items = visibleNav(user);
  const primary = MOBILE_SHORTCUTS.map((path) => items.find((item) => item.path === path))
    .filter((item): item is AdminNavItem => Boolean(item))
    .slice(0, BOTTOM_NAV_SLOTS);
  for (const item of items) {
    if (primary.length >= BOTTOM_NAV_SLOTS) break;
    if (!primary.some((current) => current.path === item.path)) primary.push(item);
  }
  const primaryPaths = new Set(primary.map((item) => item.path));
  return { primary, more: items.filter((item) => !primaryPaths.has(item.path)) };
}

export function firstReachablePath(user: Access | null): string | null {
  return visibleNav(user)[0]?.path ?? null;
}
