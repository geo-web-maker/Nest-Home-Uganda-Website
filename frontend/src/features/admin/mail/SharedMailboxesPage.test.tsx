import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { apiClient } from '../../../lib/api/client';
import { SharedMailboxesPage } from './SharedMailboxesPage';

vi.mock('../../../lib/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const people = [
  { id: 'u1', name: 'Amina', email: 'amina@bhcug.com' },
  { id: 'u2', name: 'Ruth', email: 'ruth@bhcug.com' },
];
const boxes = [{ id: 'b1', local_part: 'info', address: 'info@bhcug.com', display_name: 'Info desk', members: [{ user_id: 'u1', role: 'owner' }] }];

function api(options: { sharedFail?: boolean } = {}) {
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path === '/mail/shared') {
      if (options.sharedFail) throw new Error('totp required');
      return { items: boxes };
    }
    if (path === '/admin/users') return { items: people, total: 2, page: 1, page_size: 100 };
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.post).mockResolvedValue({});
  vi.mocked(apiClient.put).mockResolvedValue({ updated: true });
  vi.mocked(apiClient.delete).mockResolvedValue({ removed: true });
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SharedMailboxesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SharedMailboxesPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists shared mailboxes with the people assigned to them', async () => {
    api();
    setup();
    expect(await screen.findByRole('region', { name: 'info@bhcug.com' })).toBeInTheDocument();
    expect(await screen.findByText(/Amina \(amina@bhcug.com\)/)).toBeInTheDocument();
  });

  it('creates a shared mailbox with a lower-case address name', async () => {
    api();
    const user = userEvent.setup();
    setup();
    await screen.findByRole('region', { name: 'info@bhcug.com' });
    await user.type(screen.getByLabelText('Address name (before the @)'), 'Care.Team');
    await user.type(screen.getByLabelText('Display name'), 'Care team');
    await user.click(screen.getByRole('button', { name: 'Create mailbox' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/mail/shared', { local_part: 'care.team', display_name: 'Care team' }));
  });

  it('assigns a second person, so several people can share one address', async () => {
    api();
    const user = userEvent.setup();
    setup();
    await screen.findByRole('region', { name: 'info@bhcug.com' });
    await user.selectOptions(screen.getByLabelText('Person (info@bhcug.com)'), 'u2');
    await user.click(screen.getByRole('button', { name: 'Assign (info@bhcug.com)' }));
    await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith('/mail/shared/b1/members/u2', { role: 'send_as' }));
  });

  it('removes a person from the mailbox', async () => {
    api();
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Remove: Amina (amina@bhcug.com) (info@bhcug.com)' }));
    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith('/mail/shared/b1/members/u1'));
  });

  it('asks for the authenticator code when the list is refused, then verifies', async () => {
    api({ sharedFail: true });
    const user = userEvent.setup();
    setup();
    expect(await screen.findByText(/Verify your authenticator code below/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Six-digit authenticator code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/mail/totp/verify', { code: '123456' }));
  });
});
