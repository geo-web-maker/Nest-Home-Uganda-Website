import { copy } from '../copy';

/** Shared classification for queued writes and photo uploads.
 *
 * Network/session/transient server failures should stay queued. Definitive
 * client-side rejections should be surfaced for human review instead of
 * blocking every later operation in the outbox.
 */
export type SyncFailure = {
  status?: number;
  detail?: string;
  message?: string;
};

export function getSyncFailure(error: unknown): SyncFailure {
  if (error === null || error === undefined) return {};
  if (typeof error !== 'object') {
    return { ...(typeof error === 'string' ? { message: error } : {}) };
  }

  const candidate = error as { status?: unknown; detail?: unknown; message?: unknown };
  const status = Number(candidate.status);
  return {
    ...(Number.isFinite(status) && status > 0 ? { status } : {}),
    ...(typeof candidate.detail === 'string' ? { detail: candidate.detail } : {}),
    ...(typeof candidate.message === 'string' ? { message: candidate.message } : {}),
  };
}

export function isRetryableSyncFailure(error: unknown): boolean {
  const { status } = getSyncFailure(error);
  if (status === undefined) return true;
  // 401 may mean an expired session; 408/425/429 are transient by definition.
  if ([401, 408, 425, 429].includes(status)) return true;
  return status < 400 || status >= 500;
}

export function syncFailureMessage(error: unknown, fallback = copy.sync.failures.unavailable): string {
  const failure = getSyncFailure(error);
  return failure.detail || failure.message || fallback;
}

/** Exponential retry delay capped at five minutes. `attempt` is one-based. */
export function retryDelayMs(attempt: number): number {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  return Math.min(300_000, 2_000 * 2 ** Math.min(safeAttempt - 1, 20));
}

/** ISO timestamp used by the local outbox to avoid hot-looping transient failures. */
export function retryAfterIso(attempt: number, now = Date.now()): string {
  return new Date(now + retryDelayMs(attempt)).toISOString();
}

/** A tombstone conflict cannot be retried because the visit is no longer assigned. */
export function isRemovedVisitConflict(message?: string): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  return normalized.includes('cancelled_or_reassigned') || normalized.includes('removed_visit') || normalized.includes('visit_not_assigned');
}

/** Nurse-friendly conflict explanations. Technical reason codes stay out of the UI. */
export const conflictMessages: Record<string, string> = {
  visit_not_assigned: copy.sync.conflicts.visitNotAssigned,
  adhoc_disabled: copy.sync.conflicts.adhocDisabled,
  removed_visit: copy.sync.conflicts.removedVisit,
  cancelled_or_reassigned: copy.sync.conflicts.removedVisit,
  invalid_payload: copy.sync.conflicts.invalidPayload,
  consent_required: copy.sync.conflicts.consentRequired,
};

export function conflictMessage(reason?: string): string {
  if (!reason) return copy.sync.conflicts.fallback;
  const normalized = reason.toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  if (conflictMessages[normalized]) return conflictMessages[normalized];
  if (normalized.includes('visit_not_assigned') || normalized.includes('not_assigned')) return conflictMessages.visit_not_assigned;
  if (normalized.includes('adhoc_disabled')) return conflictMessages.adhoc_disabled;
  if (normalized.includes('removed') || normalized.includes('cancelled') || normalized.includes('reassigned')) return conflictMessages.removed_visit;
  return copy.sync.conflicts.fallback;
}
