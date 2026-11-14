import { describe, expect, it } from 'vitest';
import { ADMIN_NAV } from './nav';
import { adminScreens } from './screens';

describe('admin screens', () => {
  it('registers the dashboard under its nav path, not a placeholder', () => {
    expect(adminScreens['/']).toBeDefined();
    expect(adminScreens['']).toBeUndefined();
  });

  it('only registers screens for real nav paths', () => {
    const paths = new Set(ADMIN_NAV.map((item) => item.path));
    for (const key of Object.keys(adminScreens)) expect(paths.has(key)).toBe(true);
  });
});
