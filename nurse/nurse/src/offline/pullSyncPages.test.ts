import { describe, expect, it, vi } from 'vitest';
import { pullSyncPages } from './pullSyncPages';

describe('cursor-paged visit pull', () => {
  it('passes the stored cursor forward and applies each page before moving on', async () => {
    const paths: string[] = [];
    const applied: string[] = [];
    const apiRequest = vi.fn(async (path: string) => {
      paths.push(path);
      return paths.length === 1 ? { items: [], cursor: 'cursor-1', has_more: true } : { items: [], cursor: 'cursor-2', has_more: false };
    });
    const result = await pullSyncPages({ apiRequest: apiRequest as never, getCursor: async () => 'cursor-0', applyPage: async (page) => { applied.push(page.cursor ?? ''); } });
    expect(paths[0]).toContain('cursor=cursor-0');
    expect(paths[1]).toContain('cursor=cursor-1');
    expect(applied).toEqual(['cursor-1', 'cursor-2']);
    expect(result).toEqual({ cursor: 'cursor-2', pagesRead: 2, hasMore: false });
  });
  it('stops at the configured page limit when the server still has more changes', async () => {
    const apiRequest = vi.fn(async () => ({ items: [], cursor: 'cursor-next', has_more: true }));
    const result = await pullSyncPages({ apiRequest: apiRequest as never, getCursor: async () => undefined, applyPage: async () => undefined, maxPages: 3, pageSize: 4 });
    expect(apiRequest).toHaveBeenCalledTimes(3);
    expect(result.hasMore).toBe(true);
  });
});
