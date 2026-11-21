import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('__BUNDLE_VERSION__', '1.0.0');
const { isNewerVersion } = await import('./appCenter');

describe('isNewerVersion', () => {
  it('compares each number, not the text', () => {
    expect(isNewerVersion('1.0.10', '1.0.9')).toBe(true);
    expect(isNewerVersion('1.1.0', '1.0.99')).toBe(true);
    expect(isNewerVersion('2.0.1', '1.99.99')).toBe(true);
  });
  it('is false for the same, an older, or an unreadable version', () => {
    expect(isNewerVersion('1.0.1', '1.0.1')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.1')).toBe(false);
    expect(isNewerVersion(null, '1.0.1')).toBe(false);
    expect(isNewerVersion('x.y.z', '1.0.1')).toBe(false);
  });
});
