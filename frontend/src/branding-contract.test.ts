import { describe, expect, it } from 'vitest';
import { siteEn } from './locales/en/site';
import { ADMIN_NATIVE_APP_NAME } from './admin-native/identity';

describe('Bloomwell Home Care Uganda branding contract', () => {
  it('uses the public brand on ordinary UI labels', () => {
    expect(siteEn.brand.name).toBe('Bloomwell Home Care Uganda');
    expect(siteEn.footer.copyright).toBe('© Bloomwell Home Care Uganda Limited');
  });

  it('uses the full public brand in the admin app name', () => {
    expect(ADMIN_NATIVE_APP_NAME).toBe('Bloomwell Home Care Uganda Admin');
  });
});
