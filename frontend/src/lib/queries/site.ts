import { useQuery } from '@tanstack/react-query';
import { apiClient, type ApiClient } from '../api/client';

export type SiteSettings = {
  business: {
    /** As shown to visitors, for example "0787 499 988". Turn into a tel: link with lib/phone.ts. */
    phone: string;
    /** Digits only, for wa.me links (lib/whatsapp.ts). */
    whatsapp: string;
    office: string;
    /** Opening hours; "Add opening hours" until supplied (spec 12.2). */
    hours?: string;
  };
  forms?: { open_whatsapp_after?: boolean };
};

export const DEFAULT_SITE: SiteSettings = {
  business: { phone: '0787 499 988', whatsapp: '256787499988', office: 'Kampala, Uganda' },
};

export const siteKey = ['site'] as const;

export function useSiteSettings(client: ApiClient = apiClient) {
  return useQuery({
    queryKey: siteKey,
    queryFn: () => client.get<SiteSettings>('/public/site', { params: { lang: 'en' } }),
    // Keep deterministic pre-render content but refresh from the API immediately on the client.
    initialData: DEFAULT_SITE,
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
  });
}
