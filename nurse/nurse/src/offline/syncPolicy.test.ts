import { describe, expect, it } from 'vitest';
import { conflictMessage, getSyncFailure, isRemovedVisitConflict, isRetryableSyncFailure, retryAfterIso, retryDelayMs, syncFailureMessage } from './syncPolicy';

describe('offline sync failure policy', () => {
  it('keeps network errors and unknown failures retryable', () => {
    expect(isRetryableSyncFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isRetryableSyncFailure(new Error('offline'))).toBe(true);
    expect(isRetryableSyncFailure({ detail: 'no status supplied' })).toBe(true);
  });

  it.each([401, 408, 425, 429, 500, 502, 503])('retries transient HTTP status %s', (status) => {
    expect(isRetryableSyncFailure({ status, detail: 'temporary' })).toBe(true);
  });

  it.each([400, 403, 404, 409, 410, 422])('moves definitive HTTP status %s to needs-attention', (status) => {
    expect(isRetryableSyncFailure({ status, detail: 'not accepted' })).toBe(false);
  });

  it('prefers server detail when explaining a failure', () => {
    expect(syncFailureMessage({ status: 422, detail: 'Visit is no longer assigned.' })).toBe('Visit is no longer assigned.');
    expect(syncFailureMessage({ message: 'fetch failed' })).toBe('fetch failed');
    expect(syncFailureMessage(null, 'Fallback')).toBe('Fallback');
  });

  it('extracts only a usable HTTP status', () => {
    expect(getSyncFailure({ status: '422', detail: 'invalid' })).toEqual({ status: 422, detail: 'invalid' });
    expect(getSyncFailure({ status: 'bad' })).toEqual({});
  });
});


describe('offline retry backoff', () => {
  it('uses exponential delays capped at five minutes', () => {
    expect(retryDelayMs(1)).toBe(2_000);
    expect(retryDelayMs(2)).toBe(4_000);
    expect(retryDelayMs(3)).toBe(8_000);
    expect(retryDelayMs(20)).toBe(300_000);
    expect(retryDelayMs(0)).toBe(2_000);
  });

  it('creates a deterministic ISO retry timestamp', () => {
    expect(retryAfterIso(2, Date.parse('2026-10-25T12:00:00.000Z'))).toBe('2026-10-25T12:00:04.000Z');
  });
});


describe('removed visit conflict policy', () => {
  it('identifies tombstone conflicts that must not be blindly retried', () => {
    expect(isRemovedVisitConflict('This visit was cancelled or reassigned by the organisation. Review this saved action before retrying.')).toBe(true);
    expect(isRemovedVisitConflict('The server rejected this change.')).toBe(false);
    expect(isRemovedVisitConflict(undefined)).toBe(false);
  });
});


describe('nurse-facing conflict copy', () => {
  it.each([
    ['visit_not_assigned', /no longer assigned/i],
    ['adhoc_disabled', /no longer enabled/i],
    ['removed_visit', /cancelled or reassigned/i],
    ['invalid_payload', /could not be accepted/i],
    ['consent_required', /accept the current organisation notice/i],
  ])('explains %s without exposing the reason code', (reason, expected) => {
    const message = conflictMessage(reason);
    expect(message).toMatch(expected);
    expect(message).not.toContain(reason);
  });

  it('uses a safe fallback for unknown server reason codes', () => {
    expect(conflictMessage('unrecognised_reason')).toMatch(/server did not accept/i);
  });
});
