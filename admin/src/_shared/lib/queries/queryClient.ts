/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */
import { QueryClient, type QueryClientConfig } from '@tanstack/react-query';

/** One factory for the app and for tests (tests pass `{ defaultOptions: { queries: { retry: false } } }`). */
export function createQueryClient(config: QueryClientConfig = {}): QueryClient {
  return new QueryClient({
    ...config,
    defaultOptions: {
      ...config.defaultOptions,
      queries: { retry: 1, refetchOnWindowFocus: false, ...config.defaultOptions?.queries },
    },
  });
}
