import Dexie from 'dexie';
import type { QueryClient } from '@tanstack/react-query';
import { apiClient, ApiError, setOfflineWriteHook } from '@shared/lib/api/client';
import { authStore } from '../features/admin/auth/authStore';

/**
 * Offline write queue. Only low-risk updates are saved while the device is offline: enquiry and application
 * status changes and notes. Care acknowledge/resolve/approve and scheduling are queued too (see RULES);
 * billing, money, deletes and settings are never queued. Writes are saved when the browser reports offline, or when the server
 * is unreachable and the rule is marked safe to repeat; notes are never repeated.
 */
type Op = { id?: number; userId: string; method: string; path: string; body: unknown; createdAt: number; state: 'queued' | 'failed'; error?: string };
class WriteDb extends Dexie {
  ops!: Dexie.Table<Op, number>;
  constructor() { super('nest-admin-writes'); this.version(1).stores({ ops: '++id, userId' }); }
}
type Rule = { method: string; re: RegExp; net?: boolean; local?: (qc: QueryClient, id: string, body: unknown) => void };
const merge = (key: string) => (qc: QueryClient, id: string, body: unknown) =>
  qc.setQueryData(['admin', key, id], (old: unknown) => (old && typeof old === 'object' && body && typeof body === 'object' ? { ...old, ...body } : old));
// `net: true` marks writes that are safe to repeat (they set a value or use an id the app generated), so they are
// also saved when the server could not be reached. Notes are saved only when the device is offline.
export const RULES: Rule[] = [
  { method: 'PATCH', re: /^\/admin\/enquiries\/([^/]+)$/, net: true, local: merge('enquiry') },
  { method: 'POST', re: /^\/admin\/enquiries\/[^/]+\/notes$/ },
  { method: 'PATCH', re: /^\/admin\/applications\/([^/]+)$/, net: true, local: merge('application') },
  { method: 'POST', re: /^\/admin\/applications\/[^/]+\/notes$/ },
  // Care: acknowledge / resolve / approve and scheduling with app-made ids. Money, deletes, device revokes,
  // photo hiding, settings and data exports stay live-only.
  { method: 'POST', re: /^\/admin\/care\/alerts\/[^/]+\/(acknowledge|resolve)$/, net: true },
  { method: 'POST', re: /^\/admin\/care\/sos\/[^/]+\/acknowledge$/, net: true },
  { method: 'POST', re: /^\/admin\/care\/flags\/[^/]+\/resolve$/, net: true },
  { method: 'POST', re: /^\/admin\/care\/timesheets\/[^/]+\/(approve|send-back)$/, net: true },
  { method: 'PATCH', re: /^\/admin\/care\/visits\/[^/]+$/, net: true },
  { method: 'POST', re: /^\/admin\/care\/visits$/, net: true },
  { method: 'POST', re: /^\/admin\/care\/clients$/, net: true },
  { method: 'POST', re: /^\/admin\/care\/clients\/[^/]+\/(places|stays)$/, net: true },
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
  setOfflineWriteHook(async (method, path, body, reason) => {
    const rule = RULES.find((r) => r.method === method && r.re.test(path));
    if (flushing || (rule && reason === 'network' && !rule.net)) return false; // never re-queue a write the flush is sending const owner = authStore.getUserSnapshot()?.id; const store = open();
    if (!rule || !owner || !store) return false;
    try { await store.ops.add({ userId: owner, method, path, body, createdAt: Date.now(), state: 'queued' }); } catch { return false; }
    const id = path.match(rule.re)?.[1]; if (rule.local && id) rule.local(qc, id, body);
    void refreshCounts(); return true;
  });
  const run = () => void flushWrites(qc);
  window.addEventListener('online', run); authStore.subscribe(() => { run(); void refreshCounts(); });
  window.setInterval(run, 60_000); run(); void refreshCounts();
}
