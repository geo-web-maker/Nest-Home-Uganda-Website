import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { apiClient } from '@shared/lib/api/client';
import { ClientControlPage, personLabel, type ClientPolicy, type Traffic } from './ClientControlPage';

vi.mock('@shared/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/lib/api/client')>()),
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(), getBlob: vi.fn() },
}));

const basePolicy: ClientPolicy = {
  legacy_min_interval_seconds: 300,
  min_build: 0,
  block_unversioned: false,
  blocked_user_ids: [],
  updated_at: null,
  updated_by: null,
  current_build: 1,
};
const amina = { name: 'Amina', email: 'amina@bhcug.com' };
const baseTraffic: Traffic = {
  current_build: 1,
  since: '2026-11-21T08:00:00+00:00',
  blocked: [],
  items: [
    {
      user_id: 'u-old', route: 'mailboxes', build: null, user_agent: 'OldApp/1.0', ip_hash: 'abc123', calls: 12,
      first_seen: '2026-11-21T08:01:00+00:00', last_seen: '2026-11-21T09:00:00+00:00', last_gap_seconds: 60,
      last_result: 'throttled', legacy: true, person: amina,
    },
    {
      user_id: 'u-new', route: 'unread', build: 1, user_agent: 'Chrome', ip_hash: 'def456', calls: 3,
      first_seen: '2026-11-21T08:05:00+00:00', last_seen: '2026-11-21T08:50:00+00:00', last_gap_seconds: null,
      last_result: 'ok', legacy: false, person: null,
    },
  ],
};

function api(policy: Partial<ClientPolicy> = {}, traffic: Partial<Traffic> = {}) {
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path === '/mail/admin/client-policy') return { ...basePolicy, ...policy };
    if (path === '/mail/admin/client-traffic') return { ...baseTraffic, ...traffic };
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.put).mockResolvedValue({ ...basePolicy, ...policy });
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ClientControlPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('personLabel', () => {
  it('shows name and email, or the fallback', () => {
    expect(personLabel(amina, 'x')).toBe('Amina (amina@bhcug.com)');
    expect(personLabel(null, 'fallback')).toBe('fallback');
  });
});

describe('ClientControlPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the current rules in the form', async () => {
    api({ legacy_min_interval_seconds: 120, min_build: 1, block_unversioned: true });
    setup();
    expect(await screen.findByLabelText('Older apps may refresh mail at most once every (seconds)')).toHaveValue(120);
    expect(screen.getByLabelText('Lowest build allowed')).toHaveValue(1);
    expect(screen.getByLabelText('Refuse apps that send no build number')).toBeChecked();
  });

  it('lists who is calling, marks old builds and names the person', async () => {
    api();
    setup();
    expect(await screen.findByText('Amina (amina@bhcug.com)')).toBeInTheDocument();
    expect(screen.getByText('No build number · Old')).toBeInTheDocument();
    expect(screen.getByText('1 · Current')).toBeInTheDocument();
    expect(screen.getAllByText('Slowed down').length).toBeGreaterThan(0);
  });

  it('saves a harmless change without a warning', async () => {
    api();
    const user = userEvent.setup();
    setup();
    const field = await screen.findByLabelText('Older apps may refresh mail at most once every (seconds)');
    await user.clear(field);
    await user.type(field, '600');
    await user.click(screen.getByRole('button', { name: 'Save rules' }));
    await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith('/mail/admin/client-policy', { legacy_min_interval_seconds: 600, min_build: 0, block_unversioned: false }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('asks before turning on a rule that can lock people out, and saves only after confirming', async () => {
    api();
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByLabelText('Refuse apps that send no build number'));
    await user.click(screen.getByRole('button', { name: 'Save rules' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(apiClient.put).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Save anyway' }));
    await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith('/mail/admin/client-policy', expect.objectContaining({ block_unversioned: true })));
  });

  it('asks before requiring a build newer than the current one, and Cancel changes nothing', async () => {
    api();
    const user = userEvent.setup();
    setup();
    const field = await screen.findByLabelText('Lowest build allowed');
    await user.clear(field);
    await user.type(field, '2');
    await user.click(screen.getByRole('button', { name: 'Save rules' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(apiClient.put).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('refuses a value that is not a whole number and sends nothing', async () => {
    api();
    const user = userEvent.setup();
    setup();
    const field = await screen.findByLabelText('Older apps may refresh mail at most once every (seconds)');
    await user.clear(field);
    await user.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('pauses a person from the traffic list after confirming', async () => {
    api();
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Pause Amina (amina@bhcug.com)' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(apiClient.put).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith('/mail/admin/client-policy', { blocked_user_ids: ['u-old'] }));
  });

  it('lists paused people and resumes one, keeping the others paused', async () => {
    api({ blocked_user_ids: ['u-old', 'u-other'] }, { blocked: [{ user_id: 'u-old', person: amina }, { user_id: 'u-other', person: null }] });
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Resume Amina (amina@bhcug.com)' }));
    await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith('/mail/admin/client-policy', { blocked_user_ids: ['u-other'] }));
  });

  it('hides the Pause button for someone who is already paused', async () => {
    api({ blocked_user_ids: ['u-old'] }, { blocked: [{ user_id: 'u-old', person: amina }] });
    setup();
    await screen.findByRole('button', { name: 'Resume Amina (amina@bhcug.com)' });
    expect(screen.queryByRole('button', { name: 'Pause Amina (amina@bhcug.com)' })).not.toBeInTheDocument();
  });

  it('says so when nobody is paused and no calls were seen', async () => {
    api({}, { items: [] });
    setup();
    expect(await screen.findByText('Nobody is paused.')).toBeInTheDocument();
    expect(await screen.findByText('No calls recorded yet.')).toBeInTheDocument();
  });

  it('shows a load error when the server refuses', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('forbidden'));
    setup();
    expect(await screen.findByText('Client control could not be loaded. Check your access and connection.')).toBeInTheDocument();
  });
});
