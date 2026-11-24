import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, apiClient } from '@shared/lib/api/client';

/**
 * GET that saves each result under ['admin','care','get',...] (so it is stored on the device with the other
 * admin data) and, when the network fails, returns the saved copy. `staleAt` is when that copy was saved.
 */
export function useCachedGet() {
  const qc = useQueryClient();
  const [staleAt, setStaleAt] = useState<number | null>(null);
  const get = useCallback(async <T,>(path: string, params?: Record<string, string | number | boolean | null | undefined>): Promise<T> => {
    const key = ['admin', 'care', 'get', path, params ?? {}];
    try {
      // The shared client serves its own saved copy when the network fails and reports the save time here.
      let servedAt = null as number | null;
      const data = await apiClient.get<T>(path, { params, onSavedCopy: (at) => { servedAt = at; } });
      if (servedAt !== null) { setStaleAt(servedAt); return data; }
      qc.setQueryData(key, data); setStaleAt(null); return data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) {
        const saved = qc.getQueryState(key);
        if (saved?.data !== undefined) { setStaleAt(saved.dataUpdatedAt); return saved.data as T; }
      }
      throw error;
    }
  }, [qc]);
  return { get, staleAt };
}
export const savedLabel = (at: number) => `Showing data saved ${new Date(at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.`;
