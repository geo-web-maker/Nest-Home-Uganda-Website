import { describe, expect, it } from 'vitest';
import {
  composeServiceDate,
  emptyService,
  parseServiceDate,
  serviceFromAgreement,
  serviceProblem,
} from './serviceDate';

describe('service dates', () => {
  it('reads a stored date, a stored period and nothing', () => {
    expect(parseServiceDate('2026-11-14')).toMatchObject({ mode: 'date', start: '2026-11-14' });
    expect(parseServiceDate('2026-11-14 to 2026-11-20')).toMatchObject({
      mode: 'period',
      start: '2026-11-14',
      end: '2026-11-20',
    });
    expect(parseServiceDate('2026-11-14 to 2026-11-14').mode).toBe('date');
    expect(parseServiceDate('')).toEqual(emptyService());
  });

  it('keeps older free text instead of dropping it', () => {
    const value = parseServiceDate('11/12/2022');
    expect(value.mode).toBe('none');
    expect(value.legacy).toBe('11/12/2022');
    expect(composeServiceDate(value)).toBe('11/12/2022');
  });

  it('writes a date or a period back as text', () => {
    expect(composeServiceDate({ mode: 'date', start: '2026-11-14', end: '', legacy: '' })).toBe('2026-11-14');
    expect(composeServiceDate({ mode: 'period', start: '2026-11-14', end: '2026-11-20', legacy: '' })).toBe(
      '2026-11-14 to 2026-11-20',
    );
    expect(composeServiceDate({ mode: 'period', start: '2026-11-14', end: '', legacy: '' })).toBe('');
  });

  it('flags a half-filled or backwards period only', () => {
    const period = (start: string, end: string) => ({ mode: 'period' as const, start, end, legacy: '' });
    expect(serviceProblem(period('2026-11-14', ''))).toBe('incomplete');
    expect(serviceProblem(period('2026-11-20', '2026-11-14'))).toBe('order');
    expect(serviceProblem(period('2026-11-14', '2026-11-20'))).toBe('');
    expect(serviceProblem({ mode: 'date', start: '', end: '', legacy: '' })).toBe('');
  });

  it('turns an agreement period into a date, a period or nothing', () => {
    expect(serviceFromAgreement('', '').mode).toBe('none');
    expect(serviceFromAgreement('2026-11-14', '').mode).toBe('date');
    expect(serviceFromAgreement('2026-11-14', '2026-12-14').mode).toBe('period');
  });
});
