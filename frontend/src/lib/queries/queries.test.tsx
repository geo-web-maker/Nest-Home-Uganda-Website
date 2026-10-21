import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ApiError, type ApiClient } from '../api/client';
import type { ServicePublic, ServicePublicDetail } from '../../types';
import { createQueryClient } from './queryClient';
import { useService, useServices } from './services';
import { DEFAULT_SITE, useSiteSettings } from './site';

const CARD: ServicePublic = {
  id: 'a'.repeat(24),
  slug: 'postnatal-care',
  name: 'Postnatal care',
  summary: '',
  number: 2,
  icon_key: null,
  photo_media_id: null,
};

function setup() {
  const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const get = vi.fn();
  const client = { get, post: vi.fn(), patch: vi.fn() } satisfies ApiClient;
  return { queryClient, wrapper, get, client };
}

describe('useServices', () => {
  it('fetches the public list in English under the services key', async () => {
    const { wrapper, get, client, queryClient } = setup();
    get.mockResolvedValue([CARD]);
    const { result } = renderHook(() => useServices(client), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([CARD]);
    expect(get).toHaveBeenCalledWith('/public/services', { params: { lang: 'en' } });
    expect(queryClient.getQueryData(['services'])).toEqual([CARD]);
  });

  it('does not refetch within the 60 second stale window', async () => {
    const { wrapper, get, client } = setup();
    get.mockResolvedValue([CARD]);
    const first = renderHook(() => useServices(client), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();
    const second = renderHook(() => useServices(client), { wrapper });
    expect(second.result.current.data).toEqual([CARD]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('exposes an ApiError when the request fails', async () => {
    const { wrapper, get, client } = setup();
    get.mockRejectedValue(new ApiError(500, 'http_error', 'Boom'));
    const { result } = renderHook(() => useServices(client), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ status: 500 });
  });
});

describe('useService', () => {
  it('fetches one service by slug under the service key', async () => {
    const { wrapper, get, client, queryClient } = setup();
    const detail = { ...CARD, related: [] } as unknown as ServicePublicDetail;
    get.mockResolvedValue(detail);
    const { result } = renderHook(() => useService('postnatal-care', client), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith('/public/services/postnatal-care', { params: { lang: 'en' } });
    expect(queryClient.getQueryData(['service', 'postnatal-care'])).toBe(detail);
  });

  it('encodes the slug and stays idle for an empty one', async () => {
    const { wrapper, get, client } = setup();
    get.mockResolvedValue({});
    renderHook(() => useService('a/b', client), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(get.mock.calls[0]?.[0]).toBe('/public/services/a%2Fb');

    const idle = renderHook(() => useService('', client), { wrapper });
    expect(idle.result.current.fetchStatus).toBe('idle');
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('useSiteSettings', () => {
  it(
    'shows deterministic defaults first and refreshes them from the public site endpoint',
    async () => {
      const { wrapper, get, client } = setup();
      get.mockResolvedValue(DEFAULT_SITE);
      const { result } = renderHook(() => useSiteSettings(client), { wrapper });
      expect(result.current.data).toEqual(DEFAULT_SITE);
      expect(result.current.data.business.phone).toBe('0787 499 988');
      await waitFor(() =>
        expect(get).toHaveBeenCalledWith('/public/site', { params: { lang: 'en' } }),
      );
    },
  );
});

describe('createQueryClient', () => {
  it('applies app defaults and lets callers override them', () => {
    expect(createQueryClient().getDefaultOptions().queries).toMatchObject({
      retry: 1,
      refetchOnWindowFocus: false,
    });
    const quiet = createQueryClient({ defaultOptions: { queries: { retry: false } } });
    expect(quiet.getDefaultOptions().queries?.retry).toBe(false);
  });
});
