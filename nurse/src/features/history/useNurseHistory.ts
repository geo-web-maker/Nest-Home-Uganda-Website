import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { apiRequest } from '../../lib/api/client';
import { cacheHistory, type CachedHistoryVisit } from '../../offline/db';

type HistoryPageResponse = {
  items: CachedHistoryVisit[];
  page?: number;
  page_size?: number;
};

/** Owns cached visit history and its online, deduplicated pagination lifecycle. */
export function useNurseHistory(
  online: boolean,
  setMessage: (message: string) => void,
  unavailableMessage: string,
) {
  const [history, setHistory] = useState<CachedHistoryVisit[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadMore = useCallback(async () => {
    if (loading || !online) return;
    setLoading(true);
    try {
      const nextPage = page + 1;
      const result = await apiRequest<HistoryPageResponse>(
        `/field/history?page=${nextPage}&page_size=50`,
      );
      await cacheHistory(result.items);
      setHistory((current) => [
        ...current,
        ...result.items.filter((item) => !current.some((saved) => saved.id === item.id)),
      ]);
      setPage(nextPage);
      setHasMore(result.items.length === 50);
    } catch {
      setMessage(unavailableMessage);
    } finally {
      setLoading(false);
    }
  }, [loading, online, page, setMessage, unavailableMessage]);

  return {
    history,
    setHistory: setHistory as Dispatch<SetStateAction<CachedHistoryVisit[]>>,
    page,
    setPage,
    hasMore,
    setHasMore,
    loading,
    loadMore,
  };
}
