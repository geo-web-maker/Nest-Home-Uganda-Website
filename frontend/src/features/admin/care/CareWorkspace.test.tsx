import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { apiClient } from '../../../lib/api/client';
import { CareWorkspace } from './CareWorkspace';

vi.mock('../../../lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api/client')>();
  return { ...actual, apiClient: { get: vi.fn(), post: vi.fn() } };
});

function setup() {
  return render(
    <MemoryRouter>
      <CareWorkspace />
    </MemoryRouter>,
  );
}

describe('CareWorkspace data subject tools and operational actions', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(apiClient.get).mockResolvedValue({ items: [] });
    vi.mocked(apiClient.post).mockResolvedValue({ status: 'anonymised', photos_deleted: 0 });
  });

  it('loads and displays the audited client data export', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ client: { display_name: 'Removed client' }, consents: [] });
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Data and retention' }));
    await user.type(screen.getByLabelText('Client ID'), 'client-0001');
    await user.click(screen.getByRole('button', { name: 'Export client data' }));

    expect(await screen.findByText(/Removed client/)).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/admin/care/data-requests/clients/client-0001/export');
  });

  it('requires confirmation before anonymising a client', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Data and retention' }));
    await user.type(screen.getByLabelText('Client ID'), 'client-0001');
    await user.click(screen.getByRole('button', { name: 'Anonymise client' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(apiClient.post).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('acknowledges an alert from the alerts workspace', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (path) => {
      if (path === '/admin/care/alerts') return { items: [{ id: 'alert-0001', status: 'open', message: 'A staff safety alert needs a response.' }] };
      return { items: [] };
    });
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Alerts' }));
    await user.click(await screen.findByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/admin/care/alerts/alert-0001/acknowledge', {}));
  });
});

it('opens a visit review with its timeline and keeps photo records collapsed until requested', async () => {
  vi.mocked(apiClient.get).mockImplementation(async (path) => {
    if (path === '/admin/care/visits') return { items: [{ id: 'visit-0001', status: 'completed', nurse_id: 'nurse-1', client_id: 'client-1' }] };
    if (path === '/admin/care/visits/visit-0001') return {
      visit: { id: 'visit-0001', status: 'completed', nurse_id: 'nurse-1', client_id: 'client-1' },
      events: [{ id: 'event-2', type: 'check_out', at: '2026-10-25T10:00:00Z' }, { id: 'event-1', type: 'check_in', at: '2026-10-25T09:00:00Z' }],
      notes: [{ id: 'note-1', body: 'Care completed.' }],
      flags: [],
      photos: [{ id: 'photo-1', status: 'uploaded' }],
      annotations: [],
      audit: [{ id: 'audit-1', action: 'care.visit.create', at: '2026-10-25T08:00:00Z' }],
    };
    return { items: [] };
  });
  const user = userEvent.setup();
  setup();
  await user.click(await screen.findByRole('button', { name: 'Visits' }));
  await user.click(await screen.findByRole('button', { name: 'Review visit' }));

  expect(await screen.findByRole('heading', { name: 'Visit timeline' })).toBeInTheDocument();
  expect(screen.getByText('Care completed.')).toBeInTheDocument();
  expect(screen.getByText(/care\.visit\.create/)).toBeInTheDocument();
  expect(screen.queryByText('Image preview is unavailable until the audited private image endpoint is implemented.')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Open photo records (1)' }));
  expect(await screen.findByText(/Image preview is unavailable/)).toBeInTheDocument();
});

it('saves a visit annotation with a minimum three-character comment', async () => {
  vi.mocked(apiClient.get).mockImplementation(async (path) => {
    if (path === '/admin/care/visits') return { items: [{ id: 'visit-0002', status: 'completed' }] };
    if (path === '/admin/care/visits/visit-0002') return { visit: { id: 'visit-0002', status: 'completed' }, events: [], notes: [], flags: [], photos: [], annotations: [], audit: [] };
    return { items: [] };
  });
  const user = userEvent.setup();
  setup();
  await user.click(await screen.findByRole('button', { name: 'Visits' }));
  await user.click(await screen.findByRole('button', { name: 'Review visit' }));
  const field = await screen.findByLabelText('Add annotation');
  await user.type(field, 'Follow up completed');
  await user.click(screen.getByRole('button', { name: 'Save annotation' }));
  await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/admin/care/visits/visit-0002/annotate', { comment: 'Follow up completed' }));
});
