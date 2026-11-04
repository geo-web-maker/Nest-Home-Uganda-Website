import { hasScopes } from './auth/hasScopes';
import { ADMIN_NAV, bottomNav, firstReachablePath, navItemFor, scopesFor, visibleNav } from './nav';

const user = (scopes: string[], is_superadmin = false) => ({ scopes, is_superadmin });
const paths = (items: { path: string }[]) => items.map((i) => i.path);

describe('hasScopes', () => {
  it('needs every listed scope, not just one', () => {
    const u = user(['enquiries:read']);
    expect(hasScopes(u, ['enquiries:read'])).toBe(true);
    expect(hasScopes(u, ['enquiries:read', 'enquiries:write'])).toBe(false);
  });

  it('refuses a missing user and lets a superadmin through everything', () => {
    expect(hasScopes(null, ['dashboard:view'])).toBe(false);
    expect(hasScopes(user([], true), ['system:manage', 'users:write'])).toBe(true);
  });
});

describe('mockup-aligned admin navigation', () => {
  it('declares implemented screens in the reference information architecture', () => {
    expect(ADMIN_NAV).toHaveLength(40);
    expect(Object.fromEntries(['website', 'careOperations', 'monitoring', 'safety', 'setup'].map((group) => [group, ADMIN_NAV.filter((item) => item.group === group).length]))).toEqual({ website: 11, careOperations: 7, monitoring: 8, safety: 4, setup: 10 });
    expect(paths(visibleNav(user([], true)))).toHaveLength(40);
    expect(visibleNav(user([], true)).some((item) => item.path.includes('/care/patients'))).toBe(false);
  });

  it('shows only reachable items and hides a write-only scope holder', () => {
    expect(paths(visibleNav(user(['enquiries:read', 'reports:read'])))).toEqual([
      '/admin/enquiries',
      '/admin/reports',
    ]);
    expect(visibleNav(user(['enquiries:write']))).toEqual([]);
    expect(visibleNav(null)).toEqual([]);
  });

  it('lets system managers reach system controls and data requests without general settings access', () => {
    const systemManager = user(['system:manage']);
    expect(paths(visibleNav(systemManager))).toEqual(['/admin/settings', '/admin/care/data-requests', '/admin/app-releases', '/admin/backups']);
    expect(firstReachablePath(systemManager)).toBe('/admin/settings');
  });

  it('shows only the care routes granted by the assigned read scopes', () => {
    expect(paths(visibleNav(user(['visits:read'])))).toEqual([
      '/admin/care/visits',
      '/admin/care/schedule',
      '/admin/care/team',
      '/admin/care/map',
    ]);
    expect(paths(visibleNav(user(['alerts:read'])))).toEqual([
      '/admin/care/alerts',
      '/admin/care/sos',
      '/admin/care/sos/history',
    ]);
    expect(paths(visibleNav(user(['clients:read'])))).toEqual(['/admin/care/clients']);
  });

  it('puts the reference shortcuts on mobile and leaves the other screens under More', () => {
    const all = user([], true);
    expect(paths(bottomNav(all).primary)).toEqual([
      '/admin',
      '/admin/care/visits',
      '/admin/care/alerts',
      '/admin/care/sos',
    ]);
    expect(bottomNav(all).more).toHaveLength(36);
    expect(paths(bottomNav(user(['content:read'])).primary)).toEqual(['/admin/content']);
    expect(bottomNav(user(['content:read'])).more).toEqual([]);
  });

  it('finds the first reachable path, or null', () => {
    expect(firstReachablePath(user(['jobs:read', 'users:read']))).toBe('/admin/careers');
    expect(firstReachablePath(user([]))).toBeNull();
  });

  it('gives route config the scopes for a path and throws for an unknown one', () => {
    expect(scopesFor('/admin/users')).toEqual(['users:read']);
    expect(scopesFor('/admin/care/visits')).toEqual(['visits:read']);
    expect(scopesFor('/admin/care/schedule')).toEqual(['visits:read']);
    expect(scopesFor('/admin/care/sos-procedure')).toEqual(['carecfg:read']);
    expect(() => scopesFor('/admin/nope')).toThrow();
  });
});

describe('navItemFor', () => {
  it('picks exactly one item for a URL, even when one nav path is a prefix of another', () => {
    expect(navItemFor('/admin/care/sos')?.path).toBe('/admin/care/sos');
    expect(navItemFor('/admin/care/sos/history')?.path).toBe('/admin/care/sos/history');
  });

  it('keeps a detail route under its list: an SOS case is still SOS, not History', () => {
    expect(navItemFor('/admin/care/sos/case-42')?.path).toBe('/admin/care/sos');
    expect(navItemFor('/admin/enquiries/42')?.path).toBe('/admin/enquiries');
    expect(navItemFor('/admin/care/visits/abc')?.path).toBe('/admin/care/visits');
  });

  it('matches the dashboard only on its own URL, not on every admin URL', () => {
    expect(navItemFor('/admin')?.path).toBe('/admin');
    expect(navItemFor('/admin/')?.path).toBe('/admin');
    expect(navItemFor('/admin/does-not-exist')).toBeUndefined();
  });

  it('does not match a path that only shares a prefix of letters', () => {
    expect(navItemFor('/admin/care/sos-procedure')?.path).toBe('/admin/care/sos-procedure');
    expect(navItemFor('/admin/care/sosx')).toBeUndefined();
  });

  it('resolves every nav item to itself, so no two items can ever be current together', () => {
    for (const item of ADMIN_NAV) expect(navItemFor(item.path)?.path).toBe(item.path);
  });
});

describe('mail navigation', () => {
  it('never becomes the landing page: a superadmin and a mail-only user keep their own first screen', () => {
    expect(firstReachablePath(user([], true))).toBe('/admin');
    expect(firstReachablePath(user(['mail:use', 'enquiries:read']))).toBe('/admin/enquiries');
  });

  it('lists mail after the other website screens and mail settings last in setup', () => {
    const website = ADMIN_NAV.filter((item) => item.group === 'website').map((item) => item.path);
    expect(website.at(-1)).toBe('/admin/mail');
    const setup = ADMIN_NAV.filter((item) => item.group === 'setup').map((item) => item.path);
    expect(setup.at(-1)).toBe('/admin/mail/settings');
    expect(ADMIN_NAV[0]?.path).toBe('/admin');
  });

  it('gates mail on mail:use and its settings on mail:settings:manage', () => {
    expect(scopesFor('/admin/mail')).toEqual(['mail:use']);
    expect(scopesFor('/admin/mail/settings')).toEqual(['mail:settings:manage']);
    expect(scopesFor('/admin/mail/shared')).toEqual(['mail:shared:manage']);
    expect(paths(visibleNav(user(['mail:use'])))).toEqual(['/admin/mail']);
    expect(navItemFor('/admin/mail/settings')?.path).toBe('/admin/mail/settings');
    expect(navItemFor('/admin/mail')?.path).toBe('/admin/mail');
  });
});
