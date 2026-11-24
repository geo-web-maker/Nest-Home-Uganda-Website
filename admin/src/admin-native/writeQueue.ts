import Dexie from 'dexie';
import type { QueryClient } from '@tanstack/react-query';
import { apiClient, ApiError, setOfflineWriteHook } from '@shared/lib/api/client';
import { authStore } from '../features/admin/auth/authStore';

/**
 * Offline write queue. Only low-risk updates are saved while the device is offline: enquiry and application
 * status changes and notes. Care alerts, flags, SOS, visits, billing and anything involving money or an audit
 * trail are never queued; they must happen live. A write is saved only when the browser reports offline, so a
 * request that may already have reached the server is never saved or repeated.
 */
type Op = { id?: number; userId: string; method: string; path: string; body: unknown; createdAt: number; state: 'queued' | 'failed'; error?: string };
class WriteDb extends Dexie {
  ops!: Dexie.Table<Op, number>;
  constructor() { super('nest-admin-writes'); this.version(1).stores({ ops: '++id, userId' }); }
}
type Rule = { method: string; re: RegExp; local?: (qc: QueryClient, id: string, body: unknown) => void };
const merge = (key: string) => (qc: QueryClient, id: string, body: unknown) =>
  qc.setQueryData(['admin', key, id], (old: unknown) => (old && typeof old === 'object' && body && typeof body === 'object' ? { ...old, ...body } : old));
export const RULES: Rule[] = [
  { method: 'PATCH', re: /^\/admin\/enquiries\/([^/]+)$/, local: merge('enquiry') },
  { method: 'POST', re: /^\/admin\/enquiries\/[^/]+\/notes$/ },
  { method: 'PATCH', re: /^\/admin\/applications\/([^/]+)$/, local: merge('application') },
  { method: 'POST', re: /^\/admin\/applications\/[^/]+\/notes$/ },
];

let db: WriteDb | null = null;
const open = (): WriteDb | null => { try { db ??= new WriteDb(); return db; } catch { return null; } };
let counts = { queued: 0, failed: 0 };
const listeners = new Set<() => void>();
export const subscribeWrites = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const writeCounts = () => counts;
async function refreshCounts(): Promise<void> {
  const owner = authStore.getUserSnapshot()?.id; const store = open(); if (!owner || !store) return;
  try {
    const rows = await store.ops.where('userId').equals(owner).toArray();
    const next = { queued: rows.filter((r) => r.state === 'queued').length, failed: rows.filter((r) => r.state === 'failed').length };
    if (next.queued !== counts.queued || next.failed !== counts.failed) { counts = next; listeners.forEach((l) => l()); }
  } catch { /* storage unavailable */ }
}
export async function discardFailedWrites(): Promise<void> {
  const owner = authStore.getUserSnapshot()?.id; const store = open(); if (!owner || !store) return;
  await store.ops.where('userId').equals(owner).filter((r) => r.state === 'failed').delete(); await refreshCounts();
}

let flushing = false;
export async function flushWrites(qc: QueryClient): Promise<void> {
  const { status, accessToken } = authStore.getState(); const owner = authStore.getUserSnapshot()?.id; const store = open();
  if (flushing || !navigator.onLine || status !== 'signedIn' || !accessToken || !owner || !store) return;
  flushing = true;
  try {
    const rows = (await store.ops.where('userId').equals(owner).sortBy('id')).filter((r) => r.state === 'queued');
    let sent = false;
    for (const r of rows) {
      try {
        const call = (apiClient as unknown as Record<string, (p: string, b?: unknown) => Promise<unknown>>)[r.method.toLowerCase()];
        await call(r.path, r.body); await store.ops.delete(r.id!); sent = true;
      } catch (error) {
        const code = error instanceof ApiError ? error.status : 0;
        if (code >= 400 && code < 500 && code !== 401 && code !== 429) await store.ops.update(r.id!, { state: 'failed', error: error instanceof Error ? error.message : 'Rejected' });
        else break; // offline, signed out or server trouble: keep the rest, in order, for the next attempt
      }
    }
    if (sent) void qc.invalidateQueries({ queryKey: ['admin'] });
  } catch { /* try again later */ } finally { flushing = false; void refreshCounts(); }
}

export function installWriteQueue(qc: QueryClient): void {
  setOfflineWriteHook(async (method, path, body) => {
    const rule = RULES.find((r) => r.method === method && r.re.test(path)); const owner = authStore.getUserSnapshot()?.id; const store = open();
    if (!rule || !owner || !store) return false;
    try { await store.ops.add({ userId: owner, method, path, body, createdAt: Date.now(), state: 'queued' }); } catch { return false; }
    const id = path.match(rule.re)?.[1]; if (rule.local && id) rule.local(qc, id, body);
    void refreshCounts(); return true;
  });
  const run = () => void flushWrites(qc);
  window.addEventListener('online', run); authStore.subscribe(() => { run(); void refreshCounts(); });
  window.setInterval(run, 60_000); run(); void refreshCounts();
}
