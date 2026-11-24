import Dexie from 'dexie';
import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';
import { authStore } from '../features/admin/auth/authStore';

/**
 * Keeps the admin screens' read data on the device so they still show when the app starts without a network.
 * Only `['admin', ...]` queries are saved (mail and public-site queries are not), only for the signed-in user,
 * and everything is wiped when the session is cleared. Writes still need the network.
 */
type Row = { key: string; userId: string; savedAt: number; state: DehydratedState };
class CacheDb extends Dexie {
  cache!: Dexie.Table<Row, string>;
  constructor() {
    super('nest-admin-cache');
    this.version(1).stores({ cache: 'key' });
  }
}

const ROW_KEY = 'queries';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SAVE_DELAY_MS = 2_000;
let db: CacheDb | null = null;
let savedAt: number | null = null;
const savedAtListeners = new Set<() => void>();

function open(): CacheDb | null {
  try {
    db ??= new CacheDb();
    return db;
  } catch {
    return null;
  }
}

/** When the data on screen was last written to the device (null until the first save or restore). */
export const lastSavedAt = (): number | null => savedAt;
export function subscribeLastSaved(listener: () => void): () => void {
  savedAtListeners.add(listener);
  return () => savedAtListeners.delete(listener);
}
function setSavedAt(value: number | null): void {
  savedAt = value;
  savedAtListeners.forEach((listener) => listener());
}

/** Fills the query cache from the device before the first render. Never throws and never waits long. */
export async function restoreQueryCache(queryClient: QueryClient): Promise<void> {
  const owner = authStore.getUserSnapshot()?.id;
  const store = open();
  if (!owner || !store) return;
  try {
    const row = await Promise.race([
      store.cache.get(ROW_KEY),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1_500)),
    ]);
    if (!row) return;
    if (row.userId !== owner || Date.now() - row.savedAt > MAX_AGE_MS) {
      await store.cache.delete(ROW_KEY);
      return;
    }
    hydrate(queryClient, row.state);
    setSavedAt(row.savedAt);
  } catch {
    /* A damaged or blocked cache just means a normal online start. */
  }
}

/** Saves the cache shortly after it changes and wipes it when the session ends. Returns a cleanup function. */
export function startQueryPersistence(queryClient: QueryClient): () => void {
  const store = open();
  if (!store) return () => undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    timer = undefined;
    const { status, user } = authStore.getState();
    if (status !== 'signedIn' || !user) return;
    const state = dehydrate(queryClient, {
      shouldDehydrateQuery: (query) => query.state.status === 'success' && query.queryKey[0] === 'admin',
    });
    if (state.queries.length === 0) return;
    const now = Date.now();
    void store.cache
      .put({ key: ROW_KEY, userId: user.id, savedAt: now, state })
      .then(() => setSavedAt(now))
      .catch(() => undefined);
  };
  const unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || !('action' in event) || event.action.type !== 'success') return;
    if (!timer) timer = setTimeout(save, SAVE_DELAY_MS);
  });
  const unsubscribeAuth = authStore.onCleared(() => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    setSavedAt(null);
    void store.cache.clear().catch(() => undefined);
    queryClient.clear();
  });
  return () => {
    if (timer) clearTimeout(timer);
    unsubscribeCache();
    unsubscribeAuth();
  };
}
