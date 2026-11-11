import { useQuery } from '@tanstack/react-query';
import { apiClient, type ApiClient } from '../api/client';
import type { ServicePublic, ServicePublicDetail } from '../../types';

const LANG = 'en';
const STALE_MS = 60_000;

export const servicesKey = ['services'] as const;
export const serviceKey = (slug: string) => ['service', slug] as const;

export function useServices(client: ApiClient = apiClient) {
  return useQuery({
    queryKey: servicesKey,
    queryFn: () => client.get<ServicePublic[]>('/public/services', { params: { lang: LANG } }),
    staleTime: STALE_MS,
  });
}

export function useService(slug: string, client: ApiClient = apiClient) {
  return useQuery({
    queryKey: serviceKey(slug),
    queryFn: () =>
      client.get<ServicePublicDetail>(`/public/services/${encodeURIComponent(slug)}`, {
        params: { lang: LANG },
      }),
    enabled: slug !== '',
    staleTime: STALE_MS,
  });
}
