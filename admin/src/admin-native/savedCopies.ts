import Dexie from 'dexie';
import { setSavedCopyStore, type SavedCopyStore } from '@shared/lib/api/client';
import { authStore } from '../features/admin/auth/authStore';

/**
 * Saved copies of every admin GET, kept on the device per signed-in user. The shared API client saves each
 * successful GET here and reads it back when the network fails, so screens that fetch directly (care detail,
 * mail, billing, agreements, reports) still show their last data offline. Copies expire after 7 days, the
 * store is capped, and everything is wiped when the session is cleared.
 */
type Row = { id: string; userId: string; key: string; savedAt: number; data: unknown };
class CopyDb extends Dexie {
  copies!: Dexie.Table<Row, string>;
  constructor() {
    super('nest-admin-saved-copies');
    this.version(1).stores({ copies: 'id, userId, savedAt' });
  }
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ROWS = 300;
const MAX_ROW_CHARS = 1_000_000; // a single reply larger than this is not kept
const PRUNE_EVERY = 25;

let db: CopyDb | null = null;
function open(): CopyDb | null {
  try { db ??= new CopyDb(); return db; } catch { return null; }
}

export function installSavedCopies(): () => void {
  const store = open();
  if (!store) return () => undefined;
  let saves = 0;

  const prune = async () => {
    const cutoff = Date.now() - MAX_AGE_MS;
    await store.copies.where('savedAt').below(cutoff).delete();
    const extra = (await store.copies.count()) - MAX_ROWS;
    if (extra > 0) {
      const oldest = await store.copies.orderBy('savedAt').limit(extra).primaryKeys();
      await store.copies.bulkDelete(oldest);
    }
  };

  const api: SavedCopyStore = {
    save(key, data) {
      const userId = authStore.getUserSnapshot()?.id;
      if (!userId || data === undefined) return;
      let size: number;
      try { size = JSON.stringify(data).length; } catch { return; }
      if (size > MAX_ROW_CHARS) return;
      void store.copies
        .put({ id: `${userId}|${key}`, userId, key, savedAt: Date.now(), data })
        .then(() => { if (++saves % PRUNE_EVERY === 0) return prune(); })
        .catch(() => undefined);
    },
    async load(key) {
      const userId = authStore.getUserSnapshot()?.id;
      if (!userId) return null;
      const row = await store.copies.get(`${userId}|${key}`);
      if (!row || Date.now() - row.savedAt > MAX_AGE_MS) return null;
      return { data: row.data, savedAt: row.savedAt };
    },
  };

  setSavedCopyStore(api);
  void prune().catch(() => undefined);
  const unsubscribe = authStore.onCleared(() => { void store.copies.clear().catch(() => undefined); });
  return () => { unsubscribe(); setSavedCopyStore(null); };
}
