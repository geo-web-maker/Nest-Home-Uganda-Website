import { describe, expect, it } from 'vitest';
import { kampalaDateKey } from './index';

describe('Kampala calendar date', () => {
  it('uses the Kampala date rather than the device UTC date', () => {
    expect(kampalaDateKey('2026-10-24T22:30:00.000Z')).toBe('2026-10-25');
  });

  it('keeps timestamps within the same Kampala day together', () => {
    expect(kampalaDateKey('2026-10-25T01:00:00.000Z')).toBe('2026-10-25');
    expect(kampalaDateKey('2026-10-25T20:59:59.000Z')).toBe('2026-10-25');
  });
});
