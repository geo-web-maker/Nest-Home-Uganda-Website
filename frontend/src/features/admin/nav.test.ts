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

describe('navigation from a mocked scope list', () => {
  it('lists the nine routes in spec order and shows a superadmin all of them', () => {
    expect(ADMIN_NAV.map((i) => i.labelKey)).toEqual([
      'dashboard',
      'enquiries',
      'careers',
      'applications',
      'content',
      'settings',
      'users',
      'reports',
      'activity',
    ]);
    expect(visibleNav(user([], true))).toHaveLength(9);
  });

  it('shows only reachable items and hides a write-only scope holder', () => {
    expect(paths(visibleNav(user(['enquiries:read', 'reports:read'])))).toEqual([
      '/admin/enquiries',
      '/admin/reports',
    ]);
    expect(visibleNav(user(['enquiries:write']))).toEqual([]);
    expect(visibleNav(null)).toEqual([]);
  });

  it('lets system managers reach settings without granting general settings access', () => {
    const systemManager = user(['system:manage']);
    expect(paths(visibleNav(systemManager))).toEqual(['/admin/settings']);
    expect(firstReachablePath(systemManager)).toBe('/admin/settings');
  });

  it('puts the first four reachable items in the bottom nav and the rest under More', () => {
    const all = user([], true);
    expect(paths(bottomNav(all).primary)).toEqual([
      '/admin',
      '/admin/enquiries',
      '/admin/careers',
      '/admin/applications',
    ]);
    expect(paths(bottomNav(all).more)).toHaveLength(5);
    expect(bottomNav(user(['content:read'])).more).toEqual([]);
  });

  it('finds the first reachable path, or null', () => {
    expect(firstReachablePath(user(['jobs:read', 'users:read']))).toBe('/admin/careers');
    expect(firstReachablePath(user([]))).toBeNull();
  });

  it('gives route config the scopes for a path and throws for an unknown one', () => {
    expect(scopesFor('/admin/users')).toEqual(['users:read']);
    expect(() => scopesFor('/admin/nope')).toThrow();
  });
});
