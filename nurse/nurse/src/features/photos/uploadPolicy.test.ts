import { describe, expect, it } from 'vitest';
import { canUploadPhoto } from './uploadPolicy';

describe('photo upload preference', () => {
  it('lets offline capture continue but blocks uploads until online', () => {
    expect(canUploadPhoto(false, false, { type: 'wifi' })).toBe(false);
    expect(canUploadPhoto(false, true, { type: 'cellular' })).toBe(true);
  });
  it('blocks Wi-Fi-only uploads unless the browser confirms Wi-Fi', () => {
    expect(canUploadPhoto(true, true, { type: 'wifi' })).toBe(true);
    expect(canUploadPhoto(true, true, { type: 'cellular' })).toBe(false);
    expect(canUploadPhoto(true, true, undefined)).toBe(false);
  });
});
