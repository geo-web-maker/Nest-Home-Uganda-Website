import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { apiClient, ApiError } from '../../../lib/api/client';
import { SharedMailboxesPage } from './SharedMailboxesPage';

vi.mock('../../../lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/client')>()),
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(), getBlob: vi.fn() },
}));

const people = [
  { id: 'u1', name: 'Amina', email: 'amina@bhcug.com' },
  { id: 'u2', name: 'Ruth', email: 'ruth@bhcug.com' },
];
const amina = { user_id: 'u1', role: 'owner', name: 'Amina', email: 'amina@bhcug.com', is_active: true, missing: false };
const ghost = { user_id: '6aedd653155add4646050cb6', role: 'send_as', name: null, email: null, is_active: false, missing: true };
const box = { id: 'b1', local_part: 'info', address: 'info@bhcug.com', display_name: 'Info desk', members: [amina] };

function api(options: { sharedFail?: boolean; members?: unknown[] } = {}) {
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path === '/mail/shared') {
      if (options.sharedFail) throw new Error('totp required');
      return { items: [{ ...box, members: options.members ?? box.members }], assignable_users: people };
    }
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

  it('labels a deleted user instead of showing a raw id, and can remove them', async () => {
    api({ members: [amina, ghost] });
    const user = userEvent.setup();
    setup();
    expect(await screen.findAllByText(/Removed user \(no longer exists\)/)).not.toHaveLength(0);
    expect(screen.queryByText(/6aedd653155add4646050cb6/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove missing people' }));
    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith('/mail/shared/b1/members/6aedd653155add4646050cb6'));
  });

  it('shows what the server said when a change fails', async () => {
    api();
    vi.mocked(apiClient.put).mockRejectedValue(new ApiError(404, 'not_found', 'That user no longer exists.'));
    const user = userEvent.setup();
    setup();
    await screen.findByRole('region', { name: 'info@bhcug.com' });
    await user.selectOptions(screen.getByLabelText('Person (info@bhcug.com)'), 'u2');
    await user.click(screen.getByRole('button', { name: 'Assign (info@bhcug.com)' }));
    expect(await screen.findByText(/That user no longer exists\./)).toBeInTheDocument();
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
