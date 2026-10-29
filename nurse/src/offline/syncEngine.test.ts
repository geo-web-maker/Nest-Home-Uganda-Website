import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OutboxOperation } from './db';
import { resetSyncEngineForTests, runSync } from './syncEngine';

function op(overrides: Partial<OutboxOperation> = {}): OutboxOperation {
  return { id: 'operation-0001', kind: 'check_in', visitId: 'visit-0001', ownerUserId: 'nurse-a', payload: { id: 'operation-0001' }, createdAt: '2026-10-25T10:00:00.000Z', state: 'queued', attempts: 0, ...overrides };
}
function deps(operations: OutboxOperation[], apiRequest: ReturnType<typeof vi.fn>, getProfile = vi.fn(async () => ({ user_id: 'nurse-a', consents_required: [] as Array<{ type: string; version: string; text: string }> }))) {
  const rows = new Map(operations.map((item) => [item.id, { ...item }]));
  const outbox = {
    update: vi.fn(async (id: string, patch: Partial<OutboxOperation>) => { const row = rows.get(id); if (row) rows.set(id, { ...row, ...patch }); return 1; }),
    delete: vi.fn(async (id: string) => { rows.delete(id); }),
  };
  return { rows, outbox, getProfile, dependencies: { apiRequest: apiRequest as never, getProfile, outbox: outbox as never, getQueued: async () => [...rows.values()].filter((item) => item.state === 'queued') } };
}

afterEach(() => { resetSyncEngineForTests(); vi.clearAllMocks(); });

describe('runSync', () => {
  it('sends consents before visit writes and stops at the current-consent gate', async () => {
    const requests: string[] = [];
    const queue = [op({ id: 'visit-op-0001' }), op({ id: 'consent-op-01', kind: 'consent', visitId: undefined, payload: { type: 'location', version: 'v2' } })];
    const getProfile = vi.fn().mockResolvedValueOnce({ user_id: 'nurse-a', consents_required: [{ type: 'location', version: 'v2', text: 'Notice' }] }).mockResolvedValueOnce({ user_id: 'nurse-a', consents_required: [] });
    const apiRequest = vi.fn(async (path: string) => { requests.push(path); return path === '/field/consents' ? { status: 'accepted' } : { status: 'accepted' }; });
    const kit = deps(queue, apiRequest, getProfile);
    await runSync(kit.dependencies);
    expect(requests[0]).toBe('/field/consents');
    expect(requests[1]).toContain('/check-in');
  });

  it('moves work owned by another account to needs attention without sending it', async () => {
    const apiRequest = vi.fn();
    const kit = deps([op({ ownerUserId: 'nurse-b' })], apiRequest);
    const result = await runSync(kit.dependencies);
    expect(apiRequest).not.toHaveBeenCalled();
    expect(kit.rows.get('operation-0001')?.state).toBe('needs_attention');
    expect(result.needsAttention).toBe(1);
  });

  it('defers retryable failures and marks permanent failures for review', async () => {
    const transientApi = vi.fn().mockRejectedValue({ status: 503, detail: 'Unavailable' });
    const transient = deps([op()], transientApi);
    await runSync(transient.dependencies);
    expect(transient.rows.get('operation-0001')?.state).toBe('queued');
    expect(transient.rows.get('operation-0001')?.retryAfter).toBeTruthy();

    resetSyncEngineForTests();
    const permanentApi = vi.fn().mockRejectedValue({ status: 422, detail: 'Invalid' });
    const permanent = deps([op()], permanentApi);
    await runSync(permanent.dependencies);
    expect(permanent.rows.get('operation-0001')?.state).toBe('needs_attention');
  });

  it('registers queued photos after the consent gate and before a checkout write', async () => {
    const order: string[] = [];
    const apiRequest = vi.fn(async (path: string) => { order.push(`write:${path}`); return { status: 'accepted' }; });
    const kit = deps([op({ id: 'checkout-op-001', kind: 'check_out' })], apiRequest);
    await runSync({
      ...kit.dependencies,
      beforeOperations: async () => { order.push('photo-preflight'); return { blockedCheckoutVisitIds: [] }; },
    });
    expect(order[0]).toBe('photo-preflight');
    expect(order[1]).toContain('/check-out');
  });

  it('leaves checkout queued when required photo evidence is not registered', async () => {
    const apiRequest = vi.fn(async () => ({ status: 'accepted' }));
    const kit = deps([op({ id: 'checkout-op-002', kind: 'check_out' })], apiRequest);
    const result = await runSync({
      ...kit.dependencies,
      beforeOperations: async () => ({ blockedCheckoutVisitIds: ['visit-0001'] }),
    });
    expect(apiRequest).not.toHaveBeenCalled();
    expect(kit.rows.get('checkout-op-002')?.state).toBe('queued');
    expect(result.photoRequirementBlockedCount).toBe(1);
  });

  it('shares a single in-flight run across overlapping triggers', async () => {
    let resolveProfile!: (profile: { user_id: string; consents_required: never[] }) => void;
    const profilePromise = new Promise<{ user_id: string; consents_required: never[] }>((resolve) => { resolveProfile = resolve; });
    const apiRequest = vi.fn().mockResolvedValue({ status: 'accepted' });
    const kit = deps([], apiRequest, vi.fn(() => profilePromise));
    const first = runSync(kit.dependencies);
    const second = runSync(kit.dependencies);
    expect(first).toBe(second);
    resolveProfile({ user_id: 'nurse-a', consents_required: [] });
    await first;
    expect(kit.getProfile).toHaveBeenCalledTimes(2);
  });
});
