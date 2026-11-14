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
    expect(ADMIN_NAV).toHaveLength(42);
    expect(Object.fromEntries(['website', 'careOperations', 'monitoring', 'safety', 'setup'].map((group) => [group, ADMIN_NAV.filter((item) => item.group === group).length]))).toEqual({ website: 11, careOperations: 8, monitoring: 8, safety: 4, setup: 11 });
    expect(paths(visibleNav(user([], true)))).toHaveLength(42);
    expect(visibleNav(user([], true)).some((item) => item.path.includes('/care/patients'))).toBe(false);
  });

  it('shows only reachable items and hides a write-only scope holder', () => {
    expect(paths(visibleNav(user(['enquiries:read', 'reports:read'])))).toEqual([
      '/enquiries',
      '/reports',
    ]);
    expect(visibleNav(user(['enquiries:write']))).toEqual([]);
    expect(visibleNav(null)).toEqual([]);
  });

  it('lets system managers reach system controls and data requests without general settings access', () => {
    const systemManager = user(['system:manage']);
    expect(paths(visibleNav(systemManager))).toEqual(['/settings', '/care/data-requests', '/app-releases', '/backups']);
    expect(firstReachablePath(systemManager)).toBe('/settings');
  });

  it('shows only the care routes granted by the assigned read scopes', () => {
    expect(paths(visibleNav(user(['visits:read'])))).toEqual([
      '/care/visits',
      '/care/schedule',
      '/care/team',
      '/care/map',
    ]);
    expect(paths(visibleNav(user(['alerts:read'])))).toEqual([
      '/care/alerts',
      '/care/sos',
      '/care/sos/history',
    ]);
    expect(paths(visibleNav(user(['clients:read'])))).toEqual(['/care/clients']);
  });

  it('puts the reference shortcuts on mobile and leaves the other screens under More', () => {
    const all = user([], true);
    expect(paths(bottomNav(all).primary)).toEqual([
      '/',
      '/care/visits',
      '/care/alerts',
      '/care/sos',
    ]);
    expect(bottomNav(all).more).toHaveLength(37);
    expect(paths(bottomNav(user(['content:read'])).primary)).toEqual(['/content']);
    expect(bottomNav(user(['content:read'])).more).toEqual([]);
  });

  it('finds the first reachable path, or null', () => {
    expect(firstReachablePath(user(['jobs:read', 'users:read']))).toBe('/careers');
    expect(firstReachablePath(user([]))).toBeNull();
  });

  it('gives route config the scopes for a path and throws for an unknown one', () => {
    expect(scopesFor('/users')).toEqual(['users:read']);
    expect(scopesFor('/care/visits')).toEqual(['visits:read']);
    expect(scopesFor('/care/schedule')).toEqual(['visits:read']);
    expect(scopesFor('/care/sos-procedure')).toEqual(['carecfg:read']);
    expect(() => scopesFor('/nope')).toThrow();
  });
});

describe('navItemFor', () => {
  it('picks exactly one item for a URL, even when one nav path is a prefix of another', () => {
    expect(navItemFor('/care/sos')?.path).toBe('/care/sos');
    expect(navItemFor('/care/sos/history')?.path).toBe('/care/sos/history');
  });

  it('keeps a detail route under its list: an SOS case is still SOS, not History', () => {
    expect(navItemFor('/care/sos/case-42')?.path).toBe('/care/sos');
    expect(navItemFor('/enquiries/42')?.path).toBe('/enquiries');
    expect(navItemFor('/care/visits/abc')?.path).toBe('/care/visits');
  });

  it('matches the dashboard only on its own URL, not on every admin URL', () => {
    expect(navItemFor('/')?.path).toBe('/');
    expect(navItemFor('/care')).toBeUndefined();
    expect(navItemFor('/does-not-exist')).toBeUndefined();
  });

  it('does not match a path that only shares a prefix of letters', () => {
    expect(navItemFor('/care/sos-procedure')?.path).toBe('/care/sos-procedure');
    expect(navItemFor('/care/sosx')).toBeUndefined();
  });

  it('resolves every nav item to itself, so no two items can ever be current together', () => {
    for (const item of ADMIN_NAV) expect(navItemFor(item.path)?.path).toBe(item.path);
  });
});

describe('root-based navigation matching', () => {
  it('matches dashboard only at / and selects the longest nested item', () => {
    expect(navItemFor('/')?.path).toBe('/');
    expect(navItemFor('/care')).toBeUndefined();
    expect(navItemFor('/care/clients/123')?.path).toBe('/care/clients');
    expect(navItemFor('/mail')?.path).toBe('/mail');
    expect(navItemFor('/careers')?.path).toBe('/careers');
  });
});

describe('mail navigation', () => {
  it('never becomes the landing page: a superadmin and a mail-only user keep their own first screen', () => {
    expect(firstReachablePath(user([], true))).toBe('/');
    expect(firstReachablePath(user(['mail:use', 'enquiries:read']))).toBe('/enquiries');
  });

  it('lists mail after the other website screens and mail settings last in setup', () => {
    const website = ADMIN_NAV.filter((item) => item.group === 'website').map((item) => item.path);
    expect(website.at(-1)).toBe('/mail');
    const setup = ADMIN_NAV.filter((item) => item.group === 'setup').map((item) => item.path);
    expect(setup.at(-1)).toBe('/mail/settings');
    expect(ADMIN_NAV[0]?.path).toBe('/');
  });

  it('gates mail on mail:use and its settings on mail:settings:manage', () => {
    expect(scopesFor('/mail')).toEqual(['mail:use']);
    expect(scopesFor('/mail/settings')).toEqual(['mail:settings:manage']);
    expect(scopesFor('/mail/shared')).toEqual(['mail:shared:manage']);
    expect(scopesFor('/agreements')).toEqual(['agreements:read']);
    expect(scopesFor('/billing')).toEqual(['billing:read']);
    expect(scopesFor('/billing/receipts')).toEqual(['billing:read']);
    expect(paths(visibleNav(user(['mail:use'])))).toEqual(['/mail']);
    expect(navItemFor('/mail/settings')?.path).toBe('/mail/settings');
    expect(navItemFor('/mail')?.path).toBe('/mail');
  });
});
