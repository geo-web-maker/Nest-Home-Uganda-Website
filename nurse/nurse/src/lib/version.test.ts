import { describe, expect, it } from 'vitest';
import { compareVersions, isForcedUpdate } from './version';

describe('nurse app version comparison', () => {
  it('compares numeric segments rather than string order', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
    expect(compareVersions('1.0.0', '1.0')).toBe(0);
    expect(compareVersions('v0.1.0', '0.1.1')).toBe(-1);
  });
  it('blocks only versions below the configured minimum', () => {
    expect(isForcedUpdate('0.1.0', '0.2.0')).toBe(true);
    expect(isForcedUpdate('0.2.0', '0.2.0')).toBe(false);
  });
});
