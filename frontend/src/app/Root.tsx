import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { createQueryClient } from '../lib/queries/queryClient';

/** Top of the route tree: provides TanStack Query to the public site and, later, the admin. */
export function Root() {
  const [queryClient] = useState(() => createQueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
