import { describe, expect, it } from 'vitest';
import { passwordStrength } from './passwordStrength';

describe('passwordStrength', () => {
  it('only requires 8 characters, with no symbol or case rules', () => {
    expect(passwordStrength('tulip2026')).toBe('okay');
    expect(passwordStrength('abc')).toBe('short');
    expect(passwordStrength('')).toBe('empty');
  });
  it('flags common and repeated passwords, and rewards length', () => {
    expect(passwordStrength('Password123')).toBe('weak');
    expect(passwordStrength('aaaaaaaa')).toBe('weak');
    expect(passwordStrength('sunny days ahead')).toBe('strong');
  });
});
