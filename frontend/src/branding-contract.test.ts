import { describe, expect, it } from 'vitest';
import { siteEn } from './locales/en/site';
import { ADMIN_NATIVE_APP_NAME } from './admin-native/identity';

describe('Well Nest Home Care Uganda branding contract', () => {
  it('uses the public brand on ordinary UI labels', () => {
    expect(siteEn.brand.name).toBe('Well Nest Home Care Uganda');
    expect(siteEn.footer.copyright).toBe('© Well Nest Home Care Uganda Ltd');
  });

  it('uses the full public brand in the admin app name', () => {
    expect(ADMIN_NATIVE_APP_NAME).toBe('Well Nest Home Care Uganda Admin');
  });
});
