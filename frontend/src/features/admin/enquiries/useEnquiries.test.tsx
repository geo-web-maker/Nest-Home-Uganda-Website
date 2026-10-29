import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ApiClient } from '../../../lib/api/client';
import { createQueryClient } from '../../../lib/queries/queryClient';
import { useEnquiries, type EnquiryFilters } from './useEnquiries';

const FILTERS: EnquiryFilters = {
  q: '',
  status: '',
  service: '',
  from: '',
  to: '',
  sort: '-created_at',
  page: 1,
};

function setup() {
  const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const get = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25 });
  const client = { get, post: vi.fn(), patch: vi.fn(), put: vi.fn() } satisfies ApiClient;
  return { wrapper, get, client };
}

describe('useEnquiries', () => {
  it('asks for the first page of 25, newest first, with empty filters left blank', async () => {
    const { wrapper, get, client } = setup();
    const { result } = renderHook(() => useEnquiries(FILTERS, client), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith('/admin/enquiries', {
      params: {
        q: '',
        status: '',
        service: '',
        from: undefined,
        to: undefined,
        sort: '-created_at',
        page: 1,
        page_size: 25,
      },
    });
  });

  it('sends search, status, service, sort and page as given', async () => {
    const { wrapper, get, client } = setup();
    const filters = {
      ...FILTERS,
      q: '  Grace ',
      status: 'new',
      service: 'a'.repeat(24),
      sort: 'created_at' as const,
      page: 3,
    };
    renderHook(() => useEnquiries(filters, client), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(get.mock.calls[0]?.[1]).toMatchObject({
      params: { q: 'Grace', status: 'new', service: 'a'.repeat(24), sort: 'created_at', page: 3 },
    });
  });

  it('turns a date range into Kampala-day boundaries in UTC', async () => {
    const { wrapper, get, client } = setup();
    renderHook(() => useEnquiries({ ...FILTERS, from: '2026-10-01', to: '2026-10-02' }, client), {
      wrapper,
    });
    await waitFor(() => expect(get).toHaveBeenCalled());
    const params = (get.mock.calls[0]?.[1] as { params: Record<string, unknown> }).params;
    expect(params.from).toBe('2026-09-30T21:00:00.000Z');
    expect(params.to).toBe('2026-10-02T20:59:59.999Z');
  });

  it('leaves an invalid date off', async () => {
    const { wrapper, get, client } = setup();
    renderHook(() => useEnquiries({ ...FILTERS, from: 'not-a-date' }, client), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(
      (get.mock.calls[0]?.[1] as { params: Record<string, unknown> }).params.from,
    ).toBeUndefined();
  });
});
