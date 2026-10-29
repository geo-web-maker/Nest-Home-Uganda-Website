import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../lib/api/client';
import { PermissionsPage } from './GovernancePages';

vi.mock('./auth/useAuth', () => ({
  useAuth: () => ({ status: 'signedIn', user: { id: '1', name: 'Root', email: 'root@x.test', scopes: [], is_superadmin: true } }),
}));
vi.mock('../../lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api/client')>();
  return { ...actual, apiClient: { get: vi.fn() } };
});

const users = [
  { id: 'u1', name: 'Root Admin', email: 'root@x.test', scopes: [], is_superadmin: true, status: 'active' },
  { id: 'u2', name: 'Sam Supervisor', email: 'sam@x.test', scopes: ['visits:read'], is_superadmin: false, status: 'active' },
];
const scopes = [
  { id: 'visits:read', group: 'care', label: 'View visits' },
  { id: 'visits:write', group: 'care', label: 'Edit visits' },
  { id: 'users:read', group: 'users', label: 'View users' },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PermissionsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(apiClient.get).mockImplementation(((path: string) =>
    Promise.resolve(path === '/admin/scopes' ? scopes : { items: users })) as never);
});

describe('PermissionsPage matrix', () => {
  it('lists scopes down the side and people across the top, grouped by area', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: 'Direct user scopes (read-only)' });
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent ?? '');
    expect(headers[0]).toBe('Scope');
    expect(headers.some((h) => h.includes('Root Admin') && h.includes('Superadmin'))).toBe(true);
    expect(headers.some((h) => h.includes('Sam Supervisor'))).toBe(true);
    expect(within(table).getByRole('rowheader', { name: /View visits/ })).toBeInTheDocument();
    expect(within(table).getByText('care')).toBeInTheDocument();
    expect(within(table).getByText('users')).toBeInTheDocument();
  });

  it('shows direct grants and superadmin access per person', async () => {
    renderPage();
    await screen.findByRole('table');
    expect(screen.getByLabelText('Sam Supervisor: visits:read: granted')).toHaveTextContent('✓');
    expect(screen.getByLabelText('Sam Supervisor: visits:write: not granted')).toHaveTextContent('—');
    expect(screen.getByLabelText('Root Admin: visits:write: granted')).toHaveTextContent('✓');
  });

  it('filters people and reports when nobody matches', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('table');
    await user.type(screen.getByLabelText('Find a person'), 'zzz');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No people match');
  });
});
