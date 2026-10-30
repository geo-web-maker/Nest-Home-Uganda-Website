import { describe, expect, it } from 'vitest';
import { statusKind, statusText } from './statusChip';

describe('nurse visit status mapping', () => {
  it.each([
    ['scheduled', undefined, 'sc'],
    ['in_progress', undefined, 'pg'],
    ['completed', undefined, 'ok'],
    ['cancelled', undefined, 'rv'],
    ['missed', undefined, 'rv'],
    ['needs_attention', undefined, 'rv'],
    ['scheduled', 'verified', 'ok'],
    ['scheduled', 'needs_review', 'rv'],
    ['scheduled', 'pending_sync', 'pd'],
  ])('maps status %s with verification %s to chip %s', (status, verification, expected) => {
    expect(statusKind(status, verification)).toBe(expected);
  });

  it('lets a local pending marker take precedence over the remote status', () => {
    expect(statusKind('completed', 'verified', true)).toBe('pd');
    expect(statusText('scheduled', null, true)).toBe('Pending sync');
  });
});
