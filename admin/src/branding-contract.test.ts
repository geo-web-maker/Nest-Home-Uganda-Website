import { describe, expect, it } from 'vitest';
import { ADMIN_NATIVE_APP_NAME } from './admin-native/identity';

describe('admin app identity', () => {
  it('uses the full public brand in the standalone admin app name', () => {
    expect(ADMIN_NATIVE_APP_NAME).toBe('Bloomwell Home Care Uganda Admin');
  });
});
