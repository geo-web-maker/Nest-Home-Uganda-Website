import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient, type ApiClient } from '../../../lib/api/client';
import type { EnquiryPage } from '../../../types';

export const ENQUIRIES_PAGE_SIZE = 25;

export type EnquirySort = '-created_at' | 'created_at';

export type EnquiryFilters = {
  q: string;
  /** '' means all statuses. */
  status: string;
  /** Service id, '' means all. */
  service: string;
  /** Dates as YYYY-MM-DD, '' means open ended. */
  from: string;
  to: string;
  sort: EnquirySort;
  /** 1-based. */
  page: number;
};

export const enquiriesKey = (filters: EnquiryFilters) => ['admin', 'enquiries', filters] as const;

// The business works in Kampala time (UTC+3, no daylight saving), so a day runs from 00:00 to 23:59
// there. Returns undefined for an empty or invalid date so the filter is simply left off.
function kampalaBoundary(date: string, end: boolean): string | undefined {
  if (!date) return undefined;
  const parsed = new Date(`${date}T${end ? '23:59:59.999' : '00:00:00'}+03:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** Admin enquiries list (GET /admin/enquiries). Needs `enquiries:read`. Keeps the old page while the next loads. */
export function useEnquiries(filters: EnquiryFilters, client: ApiClient = apiClient) {
  return useQuery({
    queryKey: enquiriesKey(filters),
    queryFn: () =>
      client.get<EnquiryPage>('/admin/enquiries', {
        params: {
          q: filters.q.trim(),
          status: filters.status,
          service: filters.service,
          from: kampalaBoundary(filters.from, false),
          to: kampalaBoundary(filters.to, true),
          sort: filters.sort,
          page: filters.page,
          page_size: ENQUIRIES_PAGE_SIZE,
        },
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
