import type { SyncPullPage } from './db';

type PullDeps = {
  apiRequest: <T>(path: string, init?: RequestInit) => Promise<T>;
  getCursor: () => Promise<string | undefined>;
  applyPage: (page: SyncPullPage) => Promise<void>;
  maxPages?: number;
  pageSize?: number;
};
export type PullResult = { cursor?: string; pagesRead: number; hasMore: boolean };

/** Pulls bounded, cursor-paged schedule changes; each cursor is persisted with its page. */
export async function pullSyncPages({ apiRequest, getCursor, applyPage, maxPages = 25, pageSize = 200 }: PullDeps): Promise<PullResult> {
  let cursor = await getCursor();
  let hasMore = true;
  let pagesRead = 0;
  while (hasMore && pagesRead < maxPages) {
    const params = new URLSearchParams({ limit: String(pageSize) });
    if (cursor) params.set('cursor', cursor);
    const page = await apiRequest<SyncPullPage>(`/field/sync/pull?${params.toString()}`);
    await applyPage(page);
    cursor = page.cursor ?? cursor;
    hasMore = Boolean(page.has_more);
    pagesRead += 1;
  }
  return { cursor, pagesRead, hasMore };
}
