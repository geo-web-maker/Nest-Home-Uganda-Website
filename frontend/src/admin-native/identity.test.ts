import { describe, expect, it } from 'vitest';
import { ADMIN_NATIVE_APP_ID, ADMIN_NATIVE_APP_NAME, ADMIN_NATIVE_WEB_DIR } from './identity';

describe('admin native app identity', () => {
  it('uses the production admin package id and user-facing name', () => {
    expect(ADMIN_NATIVE_APP_ID).toBe('ug.nesthomecare.admin');
    expect(ADMIN_NATIVE_APP_NAME).toBe('Well Nest Home Care Uganda Admin');
  });

  it('builds the dedicated admin web bundle', () => {
    expect(ADMIN_NATIVE_WEB_DIR).toBe('dist-admin-native');
  });
});
