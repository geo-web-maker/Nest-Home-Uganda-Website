import { copy } from '../copy';
import Dexie, { type EntityTable } from 'dexie';

export type OutboxOperation = {
  id: string;
  kind: 'check_in' | 'check_out' | 'visit_note' | 'consent' | 'visit_create_adhoc' | 'sos';
  visitId?: string;
  ownerUserId?: string;
  payload: Record<string, unknown>;
  createdAt: string;
  state: 'queued' | 'sending' | 'needs_attention';
  attempts: number;
  lastError?: string;
  retryAfter?: string;
};
export type CachedVisit = {
  id: string;
  client_display_name: string;
  place_address_text: string;
  scheduled_start: string;
  scheduled_end: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'missed' | 'needs_attention';
  instructions: string;
  adhoc: boolean;
  check_in_at?: string | null;
  check_out_at?: string | null;
  safety_timer_until?: string | null;
  safety_timer_sync_state?: 'pending_sync' | 'confirmed';
  safety_checkout_pending?: boolean;
  verification_label?: string;
  safety_state?: string;
  photo_types?: Array<'arrival' | 'departure' | 'other'>;
  photo_rules?: { allowed: boolean; required_on_checkout?: boolean; required_mode?: 'none' | 'arrival' | 'departure' | 'either' | 'both'; guidance_text?: string | null };
  photo_count?: number;
  updatedAt: string;
};
export type LocalConsent = { id: string; type: string; version: string; acceptedAt: string };
export type CachedHistoryVisit = { id: string; client_display_name?: string; scheduled_start: string; scheduled_end: string; check_in_at?: string | null; check_out_at?: string | null; status: string; verification_label?: 'verified' | 'needs_review' | 'pending_sync' | null };
export type CachedClient = { id: string; display_name: string; photo_allowed?: boolean; photo_required?: 'none' | 'arrival' | 'departure' | 'either' | 'both' | null; photo_guidance_text?: string | null };
export type SyncVisit = Omit<CachedVisit, 'updatedAt'> & { updated_at?: string; updatedAt?: string };
export type SyncPullPage = { items: SyncVisit[]; removed_visit_ids?: string[]; cursor?: string | null; has_more?: boolean };
export type LocalPhoto = { id: string; visitId: string; ownerUserId?: string; blob: Blob; thumbnail?: Blob; mime: string; photoType?: 'arrival' | 'departure' | 'other'; createdAt: string; uploadStage?: 'pending_upload' | 'uploaded'; state: 'queued' | 'sending' | 'needs_attention'; attempts: number; lastError?: string; retryAfter?: string }; 

class NurseDatabase extends Dexie {
  outbox!: EntityTable<OutboxOperation, 'id'>;
  visits!: EntityTable<CachedVisit, 'id'>;
  consents!: EntityTable<LocalConsent, 'id'>;
  history!: EntityTable<CachedHistoryVisit, 'id'>;
  clients!: EntityTable<CachedClient, 'id'>;
  photos!: EntityTable<LocalPhoto, 'id'>;
  meta!: EntityTable<{ key: string; value: string }, 'key'>;
  constructor() {
    super('nest-home-care-nurse');
    this.version(1).stores({ outbox: 'id, kind, createdAt, state' });
    this.version(2).stores({ outbox: 'id, kind, createdAt, state, visitId', visits: 'id, scheduled_start, status, updatedAt', consents: 'id, type, version' });
    this.version(3).stores({ outbox: 'id, kind, createdAt, state, visitId', visits: 'id, scheduled_start, status, updatedAt', consents: 'id, type, version', history: 'id, scheduled_start, status' });
    this.version(4).stores({ outbox: 'id, kind, createdAt, state, visitId', visits: 'id, scheduled_start, status, updatedAt', consents: 'id, type, version', history: 'id, scheduled_start, status', clients: 'id, display_name' });
    this.version(5).stores({ outbox: 'id, kind, createdAt, state, visitId', visits: 'id, scheduled_start, status, updatedAt', consents: 'id, type, version', history: 'id, scheduled_start, status', clients: 'id, display_name', photos: 'id, visitId, createdAt, state' });
    this.version(6).stores({ outbox: 'id, kind, createdAt, state, visitId', visits: 'id, scheduled_start, status, updatedAt', consents: 'id, type, version', history: 'id, scheduled_start, status', clients: 'id, display_name', photos: 'id, visitId, createdAt, state', meta: 'key' });
  }
}
export const nurseDb = new NurseDatabase();
export async function enqueueOperation(operation: Omit<OutboxOperation, 'state' | 'attempts'>) {
  await nurseDb.outbox.put({ ...operation, state: 'queued', attempts: 0 });
}
export async function listQueuedOperations(now = new Date()) {
  const nowMs = now.getTime();
  return (await nurseDb.outbox.where('state').equals('queued').sortBy('createdAt'))
    .filter((operation) => !operation.retryAfter || Date.parse(operation.retryAfter) <= nowMs);
}
export async function cacheVisits(visits: Omit<CachedVisit, 'updatedAt'>[]) {
  const now = new Date().toISOString();
  await nurseDb.visits.bulkPut(visits.map((visit) => ({ ...visit, updatedAt: now })));
}
export async function listCachedVisits() {
  return nurseDb.visits.orderBy('scheduled_start').toArray();
}
export async function updateCachedVisit(id: string, patch: Partial<CachedVisit>) {
  await nurseDb.visits.update(id, { ...patch, updatedAt: new Date().toISOString() });
}
export async function queueCount() { return (await nurseDb.outbox.where('state').equals('queued').count()) + (await nurseDb.photos.where('state').equals('queued').count()); }
export async function enqueuePhoto(photo: Omit<LocalPhoto, 'state' | 'attempts'>) { await nurseDb.photos.put({ ...photo, state: 'queued', attempts: 0 }); }
export async function listQueuedPhotos(now = new Date()) { const nowMs = now.getTime(); return (await nurseDb.photos.where('state').equals('queued').sortBy('createdAt')).filter((photo) => !photo.retryAfter || Date.parse(photo.retryAfter) <= nowMs); }
export async function updateLocalPhoto(id: string, patch: Partial<LocalPhoto>) { await nurseDb.photos.update(id, patch); }
export async function removeLocalPhoto(id: string) { await nurseDb.photos.delete(id); }
export async function recoverInterruptedOperations() { await nurseDb.outbox.where('state').equals('sending').modify({ state: 'queued' }); }
export async function recoverInterruptedPhotos() { await nurseDb.photos.where('state').equals('sending').modify({ state: 'queued' }); }
export async function listNeedsAttention() { return nurseDb.outbox.where('state').equals('needs_attention').toArray(); }
export async function listPhotosNeedsAttention() { return nurseDb.photos.where('state').equals('needs_attention').toArray(); }

export async function cacheHistory(visits: CachedHistoryVisit[]) { await nurseDb.history.bulkPut(visits); }
export async function listCachedHistory() { return nurseDb.history.orderBy('scheduled_start').reverse().toArray(); }
export async function cacheClients(clients: CachedClient[]) { await nurseDb.clients.bulkPut(clients); }
export async function listCachedClients() { return nurseDb.clients.orderBy('display_name').toArray(); }


function cursorMetaKey(userId: string) { return `sync_cursor:${userId}`; }
export async function getSyncCursor(userId: string) {
  if (!userId) return undefined;
  return (await nurseDb.meta.get(cursorMetaKey(userId)))?.value;
}
export async function clearSyncCursor(userId: string) {
  if (!userId) return;
  await nurseDb.meta.delete(cursorMetaKey(userId));
}

/** Apply a server page and its cursor atomically so a reload cannot advance past unapplied changes. */
export async function applySyncPullPage(page: SyncPullPage, ownerUserId: string) {
  const removedIds = [...new Set(page.removed_visit_ids ?? [])];
  await nurseDb.transaction('rw', nurseDb.visits, nurseDb.outbox, nurseDb.meta, async () => {
    if (removedIds.length) {
      await nurseDb.visits.bulkDelete(removedIds);
      const queued = await nurseDb.outbox.toArray();
      for (const operation of queued) {
        if (operation.visitId && removedIds.includes(operation.visitId) && operation.ownerUserId === ownerUserId && operation.state !== 'needs_attention') {
          await nurseDb.outbox.update(operation.id, {
            state: 'needs_attention',
            lastError: copy.sync.conflicts.removedVisit,
            retryAfter: undefined,
          });
        }
      }
    }
    const outbox = await nurseDb.outbox.toArray();
    const mapped: CachedVisit[] = [];
    for (const item of page.items) {
      const { updated_at: serverUpdatedAt, updatedAt: localUpdatedAt, ...visit } = item;
      const serverTimerConfirmed = Boolean(visit.safety_timer_until && visit.safety_state === 'armed');
      const local = await nurseDb.visits.get(item.id);
      const pendingVisitActions = outbox.filter((operation) =>
        operation.ownerUserId === ownerUserId &&
        (operation.visitId === item.id || (operation.kind === 'visit_create_adhoc' && operation.id === item.id)) &&
        (operation.kind === 'check_in' || operation.kind === 'check_out' || operation.kind === 'visit_create_adhoc') &&
        ['queued', 'sending', 'needs_attention'].includes(operation.state),
      ).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      let mappedVisit: CachedVisit = {
        ...visit,
        safety_timer_sync_state: serverTimerConfirmed ? 'confirmed' : undefined,
        safety_checkout_pending: false,
        updatedAt: serverUpdatedAt ?? localUpdatedAt ?? new Date().toISOString(),
      } as CachedVisit;

      // A pull is a server snapshot, not proof that a locally queued arrival/departure succeeded.
      // Preserve only the locally optimistic operation fields while that operation remains in the outbox.
      if (local && pendingVisitActions.length) {
        const lastAction = pendingVisitActions[pendingVisitActions.length - 1];
        const serverConfirmsCheckout = lastAction.kind === 'check_out' && visit.status === 'completed' && !visit.safety_timer_until;
        mappedVisit = serverConfirmsCheckout
          ? {
              ...mappedVisit,
              status: local.status,
              check_in_at: local.check_in_at ?? visit.check_in_at,
              check_out_at: local.check_out_at ?? visit.check_out_at,
              safety_state: visit.safety_state,
              safety_timer_until: null,
              safety_timer_sync_state: undefined,
              safety_checkout_pending: false,
              updatedAt: local.updatedAt,
            }
          : {
              ...mappedVisit,
              status: local.status,
              check_in_at: local.check_in_at,
              check_out_at: local.check_out_at,
              safety_state: local.safety_state,
              safety_timer_until: serverTimerConfirmed ? visit.safety_timer_until : local.safety_timer_until,
              safety_timer_sync_state: serverTimerConfirmed ? 'confirmed' : local.safety_timer_sync_state,
              safety_checkout_pending: local.safety_checkout_pending ?? (lastAction.kind === 'check_out' && local.safety_state === 'armed'),
              updatedAt: local.updatedAt,
            };
      }
      mapped.push(mappedVisit);
    }
    if (mapped.length) await nurseDb.visits.bulkPut(mapped);
    if (page.cursor) await nurseDb.meta.put({ key: cursorMetaKey(ownerUserId), value: page.cursor });
    else if (page.cursor === null) await nurseDb.meta.delete(cursorMetaKey(ownerUserId));
  });
}
