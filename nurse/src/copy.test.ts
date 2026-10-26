import { describe, expect, it } from 'vitest';
import { operationKindLabel, visitStatusLabel } from './copy';

describe('shared nurse UI labels', () => {
  it('maps known visit states to readable centralised copy', () => {
    expect(visitStatusLabel('in_progress')).toBe('In progress');
    expect(visitStatusLabel('needs_attention')).toBe('Needs attention');
  });

  it('maps outbox operation kinds without exposing enum names', () => {
    expect(operationKindLabel('check_in')).toBe('Arrival');
    expect(operationKindLabel('visit_create_adhoc')).toBe('Unscheduled visit');
    expect(operationKindLabel('unexpected_kind')).toBe('Saved action');
  });
});
