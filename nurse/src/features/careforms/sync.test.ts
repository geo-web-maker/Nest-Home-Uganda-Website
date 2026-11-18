import { describe, expect, it, vi } from 'vitest';
import { resetSyncEngineForTests, runSync } from '../../offline/syncEngine';
import type { OutboxOperation } from '../../offline/db';

describe('care_form outbox operations', () => {
  it('sync Form 03 before the check-in that depends on it, to the one-shot submit endpoint', async () => {
    resetSyncEngineForTests();
    const calls: string[] = [];
    const op = (id: string, kind: OutboxOperation['kind'], createdAt: string): OutboxOperation => ({ id, kind, visitId: 'v1', ownerUserId: 'u1', payload: {}, createdAt, state: 'queued', attempts: 0 });
    const ops = [op('a', 'care_form', '1'), op('b', 'check_in', '2')];
    const table = { update: vi.fn(async () => 1), delete: vi.fn(async () => undefined) };
    await runSync({ apiRequest: (async (path: string) => { calls.push(path); return { status: 'ok' }; }) as never, getProfile: async () => ({ user_id: 'u1', consents_required: [] }), outbox: table as never, getQueued: async () => ops });
    expect(calls).toEqual(['/field/care-forms/submit', '/field/visits/v1/check-in']);
  });
});
