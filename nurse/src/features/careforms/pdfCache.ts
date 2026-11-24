import { apiAssetUrl } from '../../lib/api/client';

/**
 * Signed-document PDFs are kept in the browser Cache Storage so they can be opened without a network.
 * Nothing here touches the IndexedDB schema. The cache is cleared on sign-out and on an account switch.
 */
const CACHE_NAME = 'nest-nurse-care-pdfs';
const keyFor = (docId: string) => apiAssetUrl(`/field/care-forms/${docId}/pdf`);
const hasCaches = () => typeof caches !== 'undefined';

export async function readCachedPdf(docId: string): Promise<Blob | null> {
  if (!hasCaches()) return null;
  try {
    const hit = await (await caches.open(CACHE_NAME)).match(keyFor(docId));
    return hit ? await hit.blob() : null;
  } catch { return null; }
}

/** Fetches the sealed PDF with the live session and stores a copy. Throws the HTTP status as `status` on failure. */
export async function fetchAndCachePdf(docId: string): Promise<Blob> {
  const res = await fetch(keyFor(docId), { headers: { Authorization: `Bearer ${sessionStorage.getItem('nurse_access_token') ?? ''}` } });
  if (!res.ok) throw Object.assign(new Error(`pdf ${res.status}`), { status: res.status });
  const copy = res.clone();
  const blob = await res.blob();
  if (hasCaches()) { try { await (await caches.open(CACHE_NAME)).put(keyFor(docId), copy); } catch { /* storage full or denied: online viewing still works */ } }
  return blob;
}

let prefetching = false;
/** Quietly stores the newest signed documents so they open offline. Runs one at a time and stops at the first failure. */
export async function prefetchPdfs(docs: Array<{ id: string; status: string; signed_at?: string | null; updated_at?: string }>, limit = 12): Promise<void> {
  if (prefetching || !hasCaches() || !sessionStorage.getItem('nurse_access_token')) return;
  prefetching = true;
  try {
    const newest = docs
      .filter((d) => d.status === 'signed' && !d.id.startsWith('local-'))
      .sort((a, b) => (b.signed_at ?? b.updated_at ?? '').localeCompare(a.signed_at ?? a.updated_at ?? ''))
      .slice(0, limit);
    const cache = await caches.open(CACHE_NAME);
    for (const doc of newest) {
      if (!navigator.onLine || !sessionStorage.getItem('nurse_access_token')) break;
      if (await cache.match(keyFor(doc.id))) continue;
      try { await fetchAndCachePdf(doc.id); } catch { break; }
    }
  } catch { /* prefetch is best effort */ } finally { prefetching = false; }
}

export async function clearPdfCache(): Promise<void> {
  if (!hasCaches()) return;
  try { await caches.delete(CACHE_NAME); } catch { /* best effort */ }
}
