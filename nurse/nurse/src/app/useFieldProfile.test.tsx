import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '../lib/api/client';
import { nurseDb } from '../offline/db';
import { useFieldProfile, type FieldProfile } from './useFieldProfile';

vi.mock('../lib/api/client', () => ({ apiRequest: vi.fn() }));

const nextProfile: FieldProfile = { user_id: 'nurse-new', display_name: 'Amina Nakato', email: 'amina@example.test', supervisor_name: 'Ruth Namusoke', supervisor_phone: '+256700000001', staff_number: 'N-0098', consents_required: [], settings: { photos_enabled: true } };
async function clearDatabase() {
  await nurseDb.outbox.clear(); await nurseDb.visits.clear(); await nurseDb.history.clear();
  await nurseDb.clients.clear(); await nurseDb.consents.clear(); await nurseDb.photos.clear(); await nurseDb.meta.clear();
}

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
afterEach(async () => { await clearDatabase(); localStorage.clear(); });

describe('field profile cache ownership', () => {
  it('restores only the current account display fields from the local profile cache', async () => {
    localStorage.setItem('nest.nurse.cache-user-id', 'nurse-cached');
    await nurseDb.meta.put({ key: 'field_profile_display:nurse-cached', value: JSON.stringify({ display_name: 'Amina Nakato', email: 'amina@example.test', supervisor_name: 'Ruth Namusoke' }) });
    const { result } = renderHook(() => useFieldProfile());
    await waitFor(() => expect(result.current.profile?.display_name).toBe('Amina Nakato'));
    expect(result.current.profile).toMatchObject({ user_id: 'nurse-cached', display_name: 'Amina Nakato', email: 'amina@example.test', supervisor_name: 'Ruth Namusoke' });
    expect(result.current.profile?.settings).toBeUndefined();
    expect(result.current.profile?.consents_required).toEqual([]);
  });

  it('persists only minimal identity display data for offline greeting and profile rendering', async () => {
    vi.mocked(apiRequest).mockResolvedValue(nextProfile as never);
    const { result } = renderHook(() => useFieldProfile());
    await act(async () => { await result.current.loadProfile(); });
    const stored = await nurseDb.meta.get('field_profile_display:nurse-new');
    expect(JSON.parse(stored?.value ?? '{}')).toEqual({ display_name: 'Amina Nakato', email: 'amina@example.test', supervisor_name: 'Ruth Namusoke' });
    expect(stored?.value).not.toContain('supervisor_phone');
    expect(stored?.value).not.toContain('photos_enabled');
  });

  it('clears prior account reference caches and cursors while retaining that account’s owned queue', async () => {
    localStorage.setItem('nest.nurse.cache-user-id', 'nurse-old');
    await nurseDb.visits.put({ id: 'visit-old', client_display_name: 'Old client', place_address_text: '', scheduled_start: '2026-10-25T08:00:00Z', scheduled_end: '2026-10-25T09:00:00Z', status: 'scheduled', instructions: '', adhoc: false, updatedAt: '2026-10-25T07:00:00Z' });
    await nurseDb.history.put({ id: 'history-old', scheduled_start: '2026-10-20T08:00:00Z', scheduled_end: '2026-10-20T09:00:00Z', status: 'completed' });
    await nurseDb.clients.put({ id: 'client-old', display_name: 'Old client' });
    await nurseDb.consents.put({ id: 'privacy:1', type: 'privacy', version: '1', acceptedAt: '2026-10-01T00:00:00Z' });
    await nurseDb.outbox.put({ id: 'op-old', kind: 'visit_note', visitId: 'visit-old', ownerUserId: 'nurse-old', payload: {}, createdAt: '2026-10-25T08:00:00Z', state: 'queued', attempts: 0 });
    await nurseDb.photos.put({ id: 'photo-old-0001', visitId: 'visit-old', ownerUserId: 'nurse-old', blob: new Blob(['photo']), mime: 'image/jpeg', createdAt: '2026-10-25T08:00:00Z', state: 'queued', attempts: 0 });
    await nurseDb.meta.put({ key: 'sync_cursor:nurse-old', value: 'old-cursor' });
    await nurseDb.meta.put({ key: 'field_profile_display:nurse-old', value: JSON.stringify({ display_name: 'Old nurse', email: 'old@example.test', supervisor_name: null }) });
    await nurseDb.meta.put({ key: 'sync_cursor:nurse-new', value: 'new-cursor' });
    vi.mocked(apiRequest).mockResolvedValue(nextProfile as never);

    const { result } = renderHook(() => useFieldProfile());
    await act(async () => { await result.current.loadProfile(); });

    expect(result.current.profile?.user_id).toBe('nurse-new');
    expect(localStorage.getItem('nest.nurse.cache-user-id')).toBe('nurse-new');
    expect(await nurseDb.visits.count()).toBe(0);
    expect(await nurseDb.history.count()).toBe(0);
    expect(await nurseDb.clients.count()).toBe(0);
    expect(await nurseDb.consents.count()).toBe(0);
    expect(await nurseDb.meta.get('sync_cursor:nurse-old')).toBeUndefined();
    expect(await nurseDb.meta.get('field_profile_display:nurse-old')).toBeUndefined();
    expect(await nurseDb.meta.get('sync_cursor:nurse-new')).toBeUndefined();
    expect(await nurseDb.outbox.get('op-old')).toBeDefined();
    expect(await nurseDb.photos.get('photo-old-0001')).toBeDefined();
  });
});
