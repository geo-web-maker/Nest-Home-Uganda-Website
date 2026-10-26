import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { applySyncPullPage, cacheClients, cacheHistory, clearSyncCursor, enqueueOperation, enqueuePhoto, getSyncCursor, listCachedClients, listCachedHistory, listCachedVisits, listQueuedOperations, listQueuedPhotos, nurseDb } from './db';

afterEach(async () => { await nurseDb.outbox.clear(); await nurseDb.visits.clear(); await nurseDb.history.clear(); await nurseDb.clients.clear(); await nurseDb.photos.clear(); await nurseDb.meta.clear(); });

describe('offline outbox', () => {
  it('does not return an operation before its retry time', async () => {
    await enqueueOperation({ id: 'op-backoff', kind: 'visit_note', payload: { note: 'test' }, createdAt: '2026-01-01T00:00:00Z' });
    await nurseDb.outbox.update('op-backoff', { retryAfter: '2026-10-25T12:00:05.000Z' });
    expect(await listQueuedOperations(new Date('2026-10-25T12:00:04.000Z'))).toHaveLength(0);
    expect(await listQueuedOperations(new Date('2026-10-25T12:00:05.000Z'))).toHaveLength(1);
  });

  it('stores queued operations locally without a network dependency', async () => {
    await enqueueOperation({ id: 'op-1', kind: 'visit_note', payload: { note: 'test' }, createdAt: '2026-01-01T00:00:00Z' });
    const queued = await listQueuedOperations();
    expect(queued).toHaveLength(1);
    expect(queued[0].state).toBe('queued');
  });
});


describe('offline reference caches', () => {
  it('keeps assigned clients available without a connection', async () => {
    await cacheClients([{ id: 'client-1', display_name: 'Assigned client' }]);
    expect(await listCachedClients()).toEqual([{ id: 'client-1', display_name: 'Assigned client' }]);
  });

  it('keeps visit history locally for offline review', async () => {
    await cacheHistory([{ id: 'visit-1', scheduled_start: '2026-10-24T09:00:00Z', scheduled_end: '2026-10-24T10:00:00Z', status: 'completed' }]);
    expect(await listCachedHistory()).toHaveLength(1);
    expect((await listCachedHistory())[0].status).toBe('completed');
  });
});


describe('offline photo queue', () => {
  it('stores photo bytes locally until upload can be completed', async () => {
    const blob = new Blob(['compressed-image'], { type: 'image/jpeg' });
    await enqueuePhoto({ id: 'photo-00000001', visitId: 'visit-00000001', blob, thumbnail: new Blob(['thumb'], { type: 'image/jpeg' }), mime: 'image/jpeg', uploadStage: 'pending_upload', createdAt: '2026-10-25T00:00:00Z' });
    const queued = await listQueuedPhotos();
    expect(queued).toHaveLength(1);
    expect(queued[0].state).toBe('queued');
    // fake-indexeddb clones a jsdom Blob into a plain object, so the bytes cannot be read back in this
    // environment. The record must still be kept with its blob field, mime and upload stage; reading real
    // bytes back is covered by the browser run in e2e/offline.spec.ts.
    expect(queued[0].blob).toBeDefined();
    expect(queued[0].mime).toBe('image/jpeg');
    expect(queued[0].uploadStage).toBe('pending_upload');
    expect(queued[0].thumbnail).toBeDefined();
    await nurseDb.photos.update('photo-00000001', { uploadStage: 'uploaded' });
    expect((await nurseDb.photos.get('photo-00000001'))?.uploadStage).toBe('uploaded');
  });
});


describe('incremental sync page application', () => {
  it('stores server visits and cursor together for the signed-in user', async () => {
    await applySyncPullPage({
      items: [{
        id: 'visit-cursor-0001',
        client_display_name: 'Assigned client',
        place_address_text: 'Kampala',
        scheduled_start: '2026-10-25T09:00:00Z',
        scheduled_end: '2026-10-25T10:00:00Z',
        status: 'scheduled',
        instructions: '',
        adhoc: false,
        safety_state: 'off',
        updated_at: '2026-10-25T08:00:00Z',
      }],
      removed_visit_ids: [],
      cursor: 'cursor-user-a',
      has_more: false,
    }, 'user-a');

    expect((await listCachedVisits())[0].updatedAt).toBe('2026-10-25T08:00:00Z');
    expect(await getSyncCursor('user-a')).toBe('cursor-user-a');
    expect(await getSyncCursor('user-b')).toBeUndefined();
    await clearSyncCursor('user-a');
    expect(await getSyncCursor('user-a')).toBeUndefined();
  });

  it('clears a stored cursor when the server requests a full resync', async () => {
    await applySyncPullPage({ items: [], cursor: 'cursor-old' }, 'user-a');
    expect(await getSyncCursor('user-a')).toBe('cursor-old');
    await applySyncPullPage({ items: [], cursor: null }, 'user-a');
    expect(await getSyncCursor('user-a')).toBeUndefined();
  });

  it('preserves an offline check-in when the pulled server snapshot is still scheduled', async () => {
    const visit = {
      id: 'visit-offline-in-0001', client_display_name: 'Assigned client', place_address_text: 'Kampala',
      scheduled_start: '2026-10-25T09:00:00Z', scheduled_end: '2026-10-25T10:00:00Z',
      status: 'in_progress' as const, instructions: '', adhoc: false,
      check_in_at: '2026-10-25T09:05:00Z', safety_state: 'armed',
      safety_timer_until: '2026-10-25T10:15:00Z', safety_timer_sync_state: 'pending_sync' as const,
      updatedAt: '2026-10-25T09:05:00Z',
    };
    await nurseDb.visits.put(visit);
    await enqueueOperation({ id: 'op-offline-in-0001', kind: 'check_in', visitId: visit.id, ownerUserId: 'user-a', payload: {}, createdAt: '2026-10-25T09:05:00Z' });

    await applySyncPullPage({ items: [{ ...visit, status: 'scheduled', check_in_at: null, safety_state: 'off', safety_timer_until: null, safety_timer_sync_state: undefined, updated_at: '2026-10-25T09:00:00Z' }], cursor: 'cursor-offline-in' }, 'user-a');

    expect(await nurseDb.visits.get(visit.id)).toMatchObject({
      status: 'in_progress', check_in_at: visit.check_in_at, safety_state: 'armed',
      safety_timer_until: visit.safety_timer_until, safety_timer_sync_state: 'pending_sync',
    });
  });

  it('keeps a queued checkout pending until a server pull confirms the change', async () => {
    const visit = {
      id: 'visit-offline-out-0001', client_display_name: 'Assigned client', place_address_text: 'Kampala',
      scheduled_start: '2026-10-25T09:00:00Z', scheduled_end: '2026-10-25T10:00:00Z',
      status: 'completed' as const, instructions: '', adhoc: false,
      check_in_at: '2026-10-25T09:05:00Z', check_out_at: '2026-10-25T10:10:00Z',
      safety_state: 'armed', safety_timer_until: '2026-10-25T10:15:00Z', safety_timer_sync_state: 'confirmed' as const,
      safety_checkout_pending: true, updatedAt: '2026-10-25T10:10:00Z',
    };
    await nurseDb.visits.put(visit);
    await enqueueOperation({ id: 'op-offline-out-0001', kind: 'check_out', visitId: visit.id, ownerUserId: 'user-a', payload: {}, createdAt: '2026-10-25T10:10:00Z' });

    await applySyncPullPage({ items: [{ ...visit, status: 'in_progress', check_out_at: null, updated_at: '2026-10-25T09:05:00Z' }], cursor: 'cursor-offline-out' }, 'user-a');

    expect(await nurseDb.visits.get(visit.id)).toMatchObject({
      status: 'completed', check_out_at: visit.check_out_at, safety_state: 'armed',
      safety_timer_sync_state: 'confirmed', safety_checkout_pending: true,
    });
  });

  it('removes tombstoned visits and moves their pending actions to needs attention', async () => {
    await applySyncPullPage({
      items: [{
        id: 'visit-keep-0001',
        client_display_name: 'Keep client',
        place_address_text: 'Kampala',
        scheduled_start: '2026-10-25T09:00:00Z',
        scheduled_end: '2026-10-25T10:00:00Z',
        status: 'scheduled',
        instructions: '',
        adhoc: false,
        safety_state: 'off',
      }],
      cursor: 'cursor-before-removal',
    }, 'user-a');
    await enqueueOperation({ id: 'op-removed-0001', kind: 'check_in', visitId: 'visit-removed-0001', ownerUserId: 'user-a', payload: {}, createdAt: '2026-10-25T08:00:00Z' });
    await nurseDb.visits.put({
      id: 'visit-removed-0001', client_display_name: 'Removed client', place_address_text: '',
      scheduled_start: '2026-10-25T09:00:00Z', scheduled_end: '2026-10-25T10:00:00Z',
      status: 'scheduled', instructions: '', adhoc: false, updatedAt: '2026-10-25T08:00:00Z',
    });

    await applySyncPullPage({ items: [], removed_visit_ids: ['visit-removed-0001'], cursor: 'cursor-after-removal' }, 'user-a');

    expect((await listCachedVisits()).map((visit) => visit.id)).toEqual(['visit-keep-0001']);
    expect(await nurseDb.outbox.get('op-removed-0001')).toMatchObject({
      state: 'needs_attention',
      lastError: expect.stringContaining('cancelled or reassigned'),
    });
    expect(await getSyncCursor('user-a')).toBe('cursor-after-removal');
  });
});
