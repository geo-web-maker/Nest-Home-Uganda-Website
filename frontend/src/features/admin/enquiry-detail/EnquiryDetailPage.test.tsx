import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api/client';
import { useAuth } from '../auth/useAuth';
import { EnquiryDetailPage } from './EnquiryDetailPage';
vi.mock('../../../lib/api/client', () => ({
  apiClient: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}));
vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }));
function signIn(scopes: string[]) {
  vi.mocked(useAuth).mockReturnValue({
    status: 'signedIn',
    user: { id: 'u1', name: 'Admin', email: 'admin@example.com', scopes, is_superadmin: false },
    login: vi.fn(),
    logout: vi.fn(),
  });
}
beforeEach(() => {
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(apiClient.patch).mockReset();
  vi.mocked(apiClient.post).mockReset();
  signIn(['enquiries:read', 'enquiries:write']);
});
const detail = {
  id: '1',
  reference: 'NC-1',
  name: 'Mary Atim',
  phone_e164: '+256787499988',
  phone_raw: '0787 499 988',
  services: [{ service_id: 'x', name: 'Home care' }],
  area: 'Ntinda',
  status: 'new',
  source: 'form',
  assigned_to: null,
  created_at: '2026-10-20T10:00:00Z',
  relationship: 'parent',
  preferred_start: null,
  note: 'Please call',
  not_proceeding_reason: null,
  consent: true,
  language: 'en',
  first_contacted_at: null,
  closed_at: null,
  events: [],
};
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/enquiries/1']}>
        <Routes>
          <Route path="/admin/enquiries/:id" element={<EnquiryDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('EnquiryDetailPage', () => {
  it('renders the request details and contact buttons', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(detail);
    setup();
    expect(await screen.findByRole('heading', { name: 'Mary Atim' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+256787499988');
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('target', '_blank');
  });
  it('shows the timeline empty state', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(detail);
    setup();
    expect(await screen.findByText('No timeline events yet.')).toBeInTheDocument();
  });
  it('shows a retry control on load failure', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('offline'));
    setup();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
  it('renders the status update and note forms', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(detail);
    setup();
    expect(await screen.findByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Note/)).toBeInTheDocument();
  });
  it('saves a status change with the new status and no reason', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(detail);
    vi.mocked(apiClient.patch).mockResolvedValue(detail);
    setup();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Status'), 'contacted');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(apiClient.patch).toHaveBeenCalledWith('/admin/enquiries/1', {
      status: 'contacted',
      reason: null,
    });
  });
  it('asks for a reason before saving not proceeding', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(detail);
    setup();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Status'), 'not_proceeding');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText(/^Reason for not proceeding/), 'price');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });
  it('leaves the forms read-only without the write scope', async () => {
    signIn(['enquiries:read']);
    vi.mocked(apiClient.get).mockResolvedValue(detail);
    setup();
    expect(await screen.findByLabelText('Status')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByLabelText(/^Note/)).toBeDisabled();
  });
});
