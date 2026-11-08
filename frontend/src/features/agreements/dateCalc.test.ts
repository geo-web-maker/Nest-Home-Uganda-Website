import { describe, expect, it } from 'vitest';
import { calcDate, type DateCalcInput } from './dateCalc';

const calc = (over: Partial<DateCalcInput>) =>
  calcDate({ start: '2026-01-01', amount: 6, unit: 'months', direction: 'after', startDayCounts: false, ...over });

describe('agreement date calculator', () => {
  it('adds months and can end the day before (a 6-month care period)', () => {
    expect(calc({})).toBe('2026-07-01');
    expect(calc({ startDayCounts: true })).toBe('2026-06-30');
  });
  it('moves to the last day of a shorter month instead of overflowing', () => {
    expect(calc({ start: '2026-08-31' })).toBe('2027-02-28');
    expect(calc({ start: '2028-02-29', amount: 1, unit: 'years' })).toBe('2029-02-28');
    expect(calc({ start: '2026-03-31', amount: 1, direction: 'before' })).toBe('2026-02-28');
  });
  it('adds and subtracts weeks and days across month ends', () => {
    expect(calc({ start: '2026-03-15', amount: 2, unit: 'weeks' })).toBe('2026-03-29');
    expect(calc({ start: '2026-03-15', amount: 2, unit: 'weeks', direction: 'before' })).toBe('2026-03-01');
    expect(calc({ start: '2026-12-25', amount: 10, unit: 'days' })).toBe('2027-01-04');
  });
  it('counts the start day as day 1 when going backwards too', () => {
    expect(calc({ start: '2026-07-01', direction: 'before', startDayCounts: true })).toBe('2026-01-02');
  });
  it('rejects an impossible date or amount', () => {
    expect(calc({ start: '2026-02-30' })).toBeNull();
    expect(calc({ start: '' })).toBeNull();
    expect(calc({ amount: -1 })).toBeNull();
    expect(calc({ amount: 1.5 })).toBeNull();
  });
});
