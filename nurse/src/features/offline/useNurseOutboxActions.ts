import type { Dispatch, SetStateAction } from 'react';
import type { CachedVisit, OutboxOperation } from '../../offline/db';
import {
  nurseDb,
  removeLocalPhoto,
  updateLocalPhoto,
} from '../../offline/db';
import { copy } from '../../copy';
import { isRemovedVisitConflict } from '../../offline/syncPolicy';

type UseNurseOutboxActionsOptions = {
  visits: CachedVisit[];
  currentUserId: string;
  createId: () => string;
  refreshLocal: () => Promise<void>;
  sync: () => Promise<void>;
  syncInFlight: { current: boolean };
  setMessage: (message: string) => void;
  setPhotoFile: Dispatch<SetStateAction<File | null>>;
  setPhotoVisitId: Dispatch<SetStateAction<string>>;
  openPhoto: (visit: CachedVisit) => void;
};

/** Owns retry, discard, audit and retake actions for locally queued nurse work. */
export function useNurseOutboxActions({
  visits,
  currentUserId,
  createId,
  refreshLocal,
  sync,
  syncInFlight,
  setMessage,
  setPhotoFile,
  setPhotoVisitId,
  openPhoto,
}: UseNurseOutboxActionsOptions) {
  async function applySavedOperationAgain(operation: OutboxOperation) {
    if (isRemovedVisitConflict(operation.lastError) || /adhoc_disabled|visit_not_assigned|no longer assigned/i.test(operation.lastError ?? '')) {
      setMessage(copy.messages.applyAgainBlocked);
      return;
    }
    const newId = createId();
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = { ...operation.payload, id: newId, client_op_id: newId };
    // Replace the rejected identifier and optimistic visit state as one local transaction.
    await nurseDb.transaction('rw', nurseDb.outbox, nurseDb.visits, async () => {
      await nurseDb.outbox.put({ id: newId, kind: operation.kind, visitId: operation.visitId, ownerUserId: currentUserId, payload, createdAt: now, state: 'queued', attempts: 0 });
      if (operation.visitId && operation.kind === 'check_in') {
        const visit = await nurseDb.visits.get(operation.visitId);
        const minutes = typeof payload.safety_timer_minutes === 'number' ? payload.safety_timer_minutes : undefined;
        await nurseDb.visits.update(operation.visitId, {
          status: 'in_progress', check_in_at: typeof payload.device_time === 'string' ? payload.device_time : now,
          ...(minutes && visit
            ? {
                safety_state: 'armed',
                safety_timer_until: new Date(Date.parse(visit.scheduled_end) + minutes * 60_000).toISOString(),
                safety_timer_sync_state: 'pending_sync' as const,
                safety_checkout_pending: false,
              }
            : {}),
          updatedAt: now,
        });
      }
      if (operation.visitId && operation.kind === 'check_out') {
        const visit = await nurseDb.visits.get(operation.visitId);
        await nurseDb.visits.update(operation.visitId, {
          status: 'completed',
          check_out_at: typeof payload.device_time === 'string' ? payload.device_time : now,
          safety_checkout_pending: visit?.safety_state === 'armed',
          updatedAt: now,
        });
      }
      await nurseDb.outbox.delete(operation.id);
    });
    await refreshLocal();
    setMessage(copy.messages.actionRequeued);
    if (navigator.onLine) void sync();
  }

  async function retrySavedOperation(id: string) {
    await nurseDb.outbox.update(id, { state: 'queued', lastError: undefined, retryAfter: undefined });
    await refreshLocal();
    setMessage(copy.messages.retryQueued);
    if (navigator.onLine) void sync();
  }

  async function discardRemovedVisitOperation(id: string) {
    await nurseDb.meta.put({
      key: `discard-audit:${Date.now()}:${id}`,
      value: JSON.stringify({
        kind: 'outbox',
        item_id: id,
        discarded_at: new Date().toISOString(),
        reason: 'Removed or reassigned visit; user confirmed discard.',
      }),
    });
    await nurseDb.outbox.delete(id);
    await refreshLocal();
    setMessage(copy.messages.removedDiscarded);
  }

  async function retrySavedPhoto(id: string) {
    await updateLocalPhoto(id, { state: 'queued', lastError: undefined, retryAfter: undefined });
    await refreshLocal();
    setMessage(copy.messages.photoRetry);
    if (navigator.onLine) void sync();
  }

  async function discardSavedOperation(id: string) {
    const operation = await nurseDb.outbox.get(id);
    if (operation && isRemovedVisitConflict(operation.lastError)) {
      await discardRemovedVisitOperation(id);
      return;
    }
    await nurseDb.meta.put({
      key: `discard-audit:${Date.now()}:${id}`,
      value: JSON.stringify({
        kind: 'outbox',
        item_id: id,
        discarded_at: new Date().toISOString(),
        reason: 'User confirmed discard from Sync status.',
      }),
    });
    await nurseDb.outbox.delete(id);
    await refreshLocal();
    setMessage(copy.messages.actionDiscarded);
  }

  async function discardSavedPhoto(id: string): Promise<boolean> {
    const photo = await nurseDb.photos.get(id);
    if (!photo) return false;
    if (syncInFlight.current || photo.state === 'sending' || photo.uploadStage === 'uploaded') {
      setMessage(copy.photos.discardAfterTransfer);
      return false;
    }
    await nurseDb.meta.put({
      key: `discard-audit:${Date.now()}:${id}`,
      value: JSON.stringify({
        kind: 'photo',
        item_id: id,
        discarded_at: new Date().toISOString(),
        reason: 'User confirmed discard of an unuploaded photo from the visit photo sheet or sync status.',
      }),
    });
    await removeLocalPhoto(id);
    await refreshLocal();
    setMessage(copy.messages.photoDiscarded);
    return true;
  }

  async function retakeSavedPhoto(id: string) {
    const photo = await nurseDb.photos.get(id);
    if (!photo || photo.state === 'sending' || photo.uploadStage === 'uploaded' || syncInFlight.current) {
      setMessage(copy.photos.discardAfterTransfer);
      return;
    }
    const visit = visits.find((item) => item.id === photo.visitId);
    if (await discardSavedPhoto(id)) {
      if (visit) openPhoto(visit);
      else {
        setPhotoFile(null);
        setPhotoVisitId('');
      }
    }
  }

  return {
    retrySavedOperation,
    applySavedOperationAgain,
    discardRemovedVisitOperation,
    retrySavedPhoto,
    discardSavedOperation,
    discardSavedPhoto,
    retakeSavedPhoto,
  };
}
