import { describe, expect, it } from 'vitest';
import { copy, operationKindLabel, visitStatusLabel } from './copy';

describe('shared nurse UI labels', () => {
  it('uses the approved nurse app name and organisation branding', () => {
    expect(copy.appName).toBe('Well Nest Home Care Uganda');
    expect(copy.appShortName).toBe('Well Nest Home Care Uganda');
    expect(copy.organisation).toBe('Well Nest Home Care Uganda Ltd');
  });

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
