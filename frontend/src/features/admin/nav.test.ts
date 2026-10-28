import { hasScopes } from './auth/hasScopes';
import { ADMIN_NAV, bottomNav, firstReachablePath, scopesFor, visibleNav } from './nav';

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
    expect(ADMIN_NAV.map((item) => item.group)).toEqual([
      'website', 'website', 'website', 'website', 'website', 'website', 'website', 'website', 'website',
      'careOperations', 'careOperations', 'careOperations', 'careOperations', 'careOperations', 'careOperations',
      'monitoring', 'monitoring', 'monitoring', 'monitoring', 'safety',
      'setup', 'setup', 'setup',
    ]);
    expect(paths(visibleNav(user([], true)))).toHaveLength(23);
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
    expect(paths(visibleNav(systemManager))).toEqual(['/admin/settings', '/admin/care/data-requests']);
    expect(firstReachablePath(systemManager)).toBe('/admin/settings');
  });

  it('shows only the care routes granted by the assigned read scopes', () => {
    expect(paths(visibleNav(user(['visits:read'])))).toEqual([
      '/admin/care/visits',
      '/admin/care/team',
    ]);
    expect(paths(visibleNav(user(['alerts:read'])))).toEqual([
      '/admin/care/alerts',
      '/admin/care/sos',
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
    expect(bottomNav(all).more).toHaveLength(19);
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
    expect(() => scopesFor('/admin/nope')).toThrow();
  });
});
