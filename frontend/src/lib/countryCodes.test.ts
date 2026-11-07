import { describe, expect, it } from 'vitest';
import { COUNTRIES, joinPhone, splitPhone } from './countryCodes';

describe('country codes', () => {
  it('has a unique ISO code for every country', () => {
    expect(new Set(COUNTRIES.map((c) => c.iso)).size).toBe(COUNTRIES.length);
  });

  it('joins a code and national digits, dropping a leading zero', () => {
    expect(joinPhone('UG', '0771 234 567')).toBe('+256771234567');
    expect(joinPhone('GB', '20 7946 0958')).toBe('+442079460958');
    expect(joinPhone('UG', '')).toBe('');
  });

  it('splits stored numbers back into country and digits', () => {
    expect(splitPhone('+256771234567')).toEqual({ iso: 'UG', national: '771234567' });
    expect(splitPhone('+14155550132')).toEqual({ iso: 'US', national: '4155550132' });
    expect(splitPhone('+18765550123')).toEqual({ iso: 'JM', national: '5550123' });
    expect(splitPhone('0771 234 567')).toEqual({ iso: 'UG', national: '771234567' });
  });

  it('keeps the chosen country when two share a code', () => {
    expect(splitPhone('+441234567890', 'JE').iso).toBe('JE');
    expect(splitPhone('+14155550132', 'CA').iso).toBe('CA');
  });
});
