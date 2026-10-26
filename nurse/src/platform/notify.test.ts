import { describe, expect, it } from 'vitest';
import { buildVisitReminderSchedule } from './notify';
import type { CachedVisit } from '../offline/db';

const now = new Date('2026-10-25T08:00:00.000Z');
function visit(overrides: Partial<CachedVisit> = {}): CachedVisit {
  return {
    id: 'visit-1', client_display_name: 'Private client name', place_address_text: 'Private address',
    scheduled_start: '2026-10-25T09:00:00.000Z', scheduled_end: '2026-10-25T10:00:00.000Z',
    status: 'scheduled', instructions: 'Private instructions', adhoc: false, updatedAt: now.toISOString(), ...overrides,
  };
}

describe('buildVisitReminderSchedule', () => {
  it('builds start-in-15, start-time and end-time reminders without private visit details', () => {
    const reminders = buildVisitReminderSchedule([visit()], now);
    expect(reminders.map((item) => item.kind)).toEqual(['starting_soon', 'start_time', 'still_working']);
    expect(reminders.map((item) => item.at.toISOString())).toEqual([
      '2026-10-25T08:45:00.000Z', '2026-10-25T09:00:00.000Z', '2026-10-25T10:00:00.000Z',
    ]);
    expect(reminders.every((item) => !item.body.includes('Private'))).toBe(true);
  });

  it('omits reminders in the past and keeps only the future end reminder for an active visit', () => {
    const active = visit({ status: 'in_progress', scheduled_start: '2026-10-25T07:00:00.000Z' });
    expect(buildVisitReminderSchedule([active], now).map((item) => item.kind)).toEqual(['still_working']);
  });

  it('ignores completed, cancelled and invalid visits', () => {
    expect(buildVisitReminderSchedule([
      visit({ status: 'completed' }), visit({ id: 'cancelled', status: 'cancelled' }),
      visit({ id: 'bad', scheduled_start: 'not-a-date' }),
    ], now)).toEqual([]);
  });

  it('uses stable ids for the same visit and reminder type', () => {
    expect(buildVisitReminderSchedule([visit()], now).map((item) => item.id))
      .toEqual(buildVisitReminderSchedule([visit()], now).map((item) => item.id));
  });
});
