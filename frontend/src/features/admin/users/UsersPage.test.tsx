import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api/client';
import { UsersPage } from './UsersPage';
vi.mock('../../../lib/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));
vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'u1',
      name: 'Admin',
      email: 'admin@example.invalid',
      scopes: ['users:read', 'users:write'],
      is_superadmin: false,
    },
  }),
}));
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('UsersPage', () => {
  it('loads scopes from the scope endpoint and does not hard-code a scope list', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (path: string) =>
      path === '/admin/scopes'
        ? [{ id: 'reports:read', group: 'Reports', label: 'Read reports' }]
        : { items: [], total: 0, page: 1, page_size: 100 },
    );
    setup();
    expect(await screen.findByText('No users found.')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/admin/scopes');
  });
  it('renders user access counts', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (path: string) =>
      path === '/admin/scopes'
        ? []
        : {
            items: [
              {
                id: 'u2',
                name: 'Editor',
                email: 'editor@example.invalid',
                scopes: ['content:read'],
                is_superadmin: false,
                last_login: null,
                status: 'active',
                active: true,
              },
            ],
            total: 1,
            page: 1,
            page_size: 100,
          },
    );
    setup();
    expect(await screen.findByText('Editor')).toBeInTheDocument();
    expect(screen.getByText('1 scopes selected')).toBeInTheDocument();
  });
  it('offers an invite control', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Invite user' })).toBeInTheDocument();
  });
  it('reports when either admin endpoint fails', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('offline'));
    setup();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
