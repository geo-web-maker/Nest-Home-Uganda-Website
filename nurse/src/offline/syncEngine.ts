import {
  listQueuedOperations,
  nurseDb,
  updateCachedVisit,
  type OutboxOperation,
} from './db';
import { isRetryableSyncFailure, retryAfterIso, syncFailureMessage } from './syncPolicy';
import type { FieldProfile } from '../app/useFieldProfile';
import { copy } from '../copy';

type SyncProfile = FieldProfile;
type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
type SyncResult = { status: string; reason?: string };

type OutboxTable = Pick<typeof nurseDb.outbox, 'update' | 'delete'>;
export type SyncPreflightResult = { blockedCheckoutVisitIds?: string[] };
export type SyncEngineDeps = {
  apiRequest: ApiRequest;
  getProfile: () => Promise<SyncProfile>;
  applyProfile?: (profile: SyncProfile) => Promise<void> | void;
  outbox?: OutboxTable;
  getQueued?: (now: Date) => Promise<OutboxOperation[]>;
  updateVisit?: typeof updateCachedVisit;
  now?: () => Date;
  /** Runs after consent is current and before visit writes; used to register required photo evidence. */
  beforeOperations?: (profile: SyncProfile) => Promise<SyncPreflightResult | void>;
};

export type SyncEngineResult = {
  profile: SyncProfile;
  consentBlocked: boolean;
  processed: number;
  needsAttention: number;
  retryDeferred: boolean;
  photoRequirementBlockedCount: number;
};

let activeRun: Promise<SyncEngineResult> | undefined;

function endpointFor(operation: OutboxOperation): { path: string; body: Record<string, unknown> } | null {
  if (operation.kind === 'consent') return { path: '/field/consents', body: operation.payload };
  if (operation.kind === 'check_in') return { path: `/field/visits/${operation.visitId}/check-in`, body: operation.payload };
  if (operation.kind === 'check_out') return { path: `/field/visits/${operation.visitId}/check-out`, body: operation.payload };
  if (operation.kind === 'visit_note') return { path: `/field/visits/${operation.visitId}/notes`, body: operation.payload };
  if (operation.kind === 'visit_create_adhoc') return { path: '/field/visits/adhoc', body: operation.payload };
  if (operation.kind === 'sos') return { path: '/field/sos', body: operation.payload };
  return null;
}

async function executeSync(deps: SyncEngineDeps): Promise<SyncEngineResult> {
  const table = deps.outbox ?? nurseDb.outbox;
  const list = deps.getQueued ?? listQueuedOperations;
  const updateVisit = deps.updateVisit ?? updateCachedVisit;
  const now = deps.now ?? (() => new Date());
  let profile = await deps.getProfile();
  await deps.applyProfile?.(profile);
  const operations = await list(now());
  let processed = 0;
  let needsAttention = 0;
  let retryDeferred = false;

  // Consent is the sole write allowed before checking the current consent gate.
  for (const operation of operations.filter((item) => item.kind === 'consent')) {
    if (operation.ownerUserId !== profile.user_id) {
      await table.update(operation.id, { state: 'needs_attention', lastError: copy.sync.failures.accountMismatch, retryAfter: undefined });
      needsAttention += 1;
      continue;
    }
    const endpoint = endpointFor(operation);
    if (!endpoint) continue;
    await table.update(operation.id, { state: 'sending', attempts: operation.attempts + 1 });
    try {
      const result = await deps.apiRequest<SyncResult>(endpoint.path, { method: 'POST', body: JSON.stringify(endpoint.body) });
      if (result.status === 'rejected') {
        await table.update(operation.id, { state: 'needs_attention', lastError: result.reason ?? copy.sync.failures.consentRejected, retryAfter: undefined });
        needsAttention += 1;
      } else {
        await table.delete(operation.id);
        processed += 1;
      }
    } catch (error) {
      const retryable = isRetryableSyncFailure(error);
      await table.update(operation.id, {
        state: retryable ? 'queued' : 'needs_attention',
        lastError: syncFailureMessage(error, copy.sync.failures.consentUnavailable),
        retryAfter: retryable ? retryAfterIso(operation.attempts + 1, now().getTime()) : undefined,
      });
      if (!retryable) needsAttention += 1;
      if (retryable) { retryDeferred = true; break; }
    }
  }

  profile = await deps.getProfile();
  await deps.applyProfile?.(profile);
  if (profile.consents_required.length > 0) {
    return { profile, consentBlocked: true, processed, needsAttention, retryDeferred, photoRequirementBlockedCount: 0 };
  }

  const preflight = await deps.beforeOperations?.(profile);
  const blockedCheckoutVisitIds = new Set(preflight?.blockedCheckoutVisitIds ?? []);
  let photoRequirementBlockedCount = 0;

  for (const operation of operations.filter((item) => item.kind !== 'consent')) {
    if (operation.kind === 'check_out' && operation.visitId && blockedCheckoutVisitIds.has(operation.visitId)) {
      // Keep the checkout queued until the server has registered the required photo evidence.
      photoRequirementBlockedCount += 1;
      continue;
    }
    if (operation.ownerUserId !== profile.user_id) {
      await table.update(operation.id, { state: 'needs_attention', lastError: copy.sync.failures.accountMismatch, retryAfter: undefined });
      if (operation.kind === 'visit_create_adhoc') await updateVisit(operation.id, { status: 'needs_attention' });
      needsAttention += 1;
      continue;
    }
    const endpoint = endpointFor(operation);
    if (!endpoint || !operation.visitId && operation.kind !== 'visit_create_adhoc' && operation.kind !== 'sos') {
      await table.update(operation.id, { state: 'needs_attention', lastError: copy.sync.failures.missingVisitReference, retryAfter: undefined });
      needsAttention += 1;
      continue;
    }
    await table.update(operation.id, { state: 'sending', attempts: operation.attempts + 1 });
    try {
      const result = await deps.apiRequest<SyncResult>(endpoint.path, { method: 'POST', body: JSON.stringify(endpoint.body) });
      if (result.status === 'rejected') {
        await table.update(operation.id, { state: 'needs_attention', lastError: result.reason ?? copy.sync.failures.actionRejected, retryAfter: undefined });
        if (operation.kind === 'visit_create_adhoc') await updateVisit(operation.id, { status: 'needs_attention' });
        if ((operation.kind === 'check_in' || operation.kind === 'check_out') && operation.visitId) await updateVisit(operation.visitId, { status: 'needs_attention' });
        needsAttention += 1;
      } else {
        await table.delete(operation.id);
        processed += 1;
      }
    } catch (error) {
      const retryable = isRetryableSyncFailure(error);
      await table.update(operation.id, {
        state: retryable ? 'queued' : 'needs_attention',
        lastError: syncFailureMessage(error, copy.sync.failures.unavailable),
        retryAfter: retryable ? retryAfterIso(operation.attempts + 1, now().getTime()) : undefined,
      });
      if (!retryable) {
        if (operation.kind === 'visit_create_adhoc') await updateVisit(operation.id, { status: 'needs_attention' });
        if ((operation.kind === 'check_in' || operation.kind === 'check_out') && operation.visitId) await updateVisit(operation.visitId, { status: 'needs_attention' });
        needsAttention += 1;
      }
      if (retryable) { retryDeferred = true; break; }
    }
  }
  return { profile, consentBlocked: false, processed, needsAttention, retryDeferred, photoRequirementBlockedCount };
}

/** Single-flight queue processor; callers may safely trigger sync from events and buttons. */
export function runSync(deps: SyncEngineDeps): Promise<SyncEngineResult> {
  if (activeRun) return activeRun;
  activeRun = executeSync(deps).finally(() => { activeRun = undefined; });
  return activeRun;
}

export function resetSyncEngineForTests() { activeRun = undefined; }
