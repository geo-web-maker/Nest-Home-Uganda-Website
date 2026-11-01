import { describe, expect, it } from 'vitest';
import { firstName, greeting, greetingDate, initials } from './greeting';

describe('Kampala nurse identity helpers', () => {
  it('uses East Africa local hours at the greeting boundaries', () => {
    expect(greeting(new Date('2026-10-24T05:00:00.000Z'))).toBe('Good morning');
    expect(greeting(new Date('2026-10-24T11:00:00.000Z'))).toBe('Good afternoon');
    expect(greeting(new Date('2026-10-24T17:00:00.000Z'))).toBe('Good evening');
  });
  it('uses the first and last name initials, then the staff-number suffix, then N', () => {
    expect(initials('Amina Nakato')).toBe('AN');
    expect(firstName('  Amina   Nakato ')).toBe('Amina');
    expect(initials('', 'NUR-092')).toBe('92');
    expect(initials(null, null)).toBe('N');
  });
  it('formats the date in Kampala rather than the device timezone', () => {
    expect(greetingDate(new Date('2026-10-23T21:30:00.000Z'))).toBe('Sat, 24 Oct');
  });
});
