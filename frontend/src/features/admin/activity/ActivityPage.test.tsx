import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api/client';
import { ActivityPage } from './ActivityPage';
vi.mock('../../../lib/api/client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
const emptyPage = { items: [], total: 0, page: 1, page_size: 25 };
function setup(activityResult: unknown = emptyPage, status = { enabled: true, verified: true }) {
  vi.mocked(apiClient.get).mockImplementation(async (path) => (
    path === '/mail/totp/status' ? status : activityResult
  ) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ActivityPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('ActivityPage', () => {
  it('renders a read-only activity table after TOTP verification', async () => {
    setup();
    expect(await screen.findByText('No activity matches these filters.')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/mail/totp/status', { retryOn401: false });
  });
  it('renders returned event data', async () => {
    setup({
      items: [{ id: 'a', at: '2026-10-20T10:00:00Z', user_name: 'Staff', action: 'Updated settings', item_type: 'settings', item_label: 'Business' }],
      total: 1, page: 1, page_size: 25,
    });
    expect(await screen.findByText('Updated settings')).toBeInTheDocument();
    expect(screen.getByText('Staff')).toBeInTheDocument();
  });
  it('sends date filters to the API', async () => {
    setup();
    expect(await screen.findByText('No activity matches these filters.')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/admin/activity', {
      params: { from: undefined, to: undefined, page: 1, page_size: 25 },
    });
  });
  it('shows an alert after request failure', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (path) => {
      if (path === '/mail/totp/status') return { enabled: true, verified: true } as never;
      throw new Error('offline');
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><ActivityPage /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
  it('keeps activity data hidden until the authenticator is verified', async () => {
    setup(emptyPage, { enabled: true, verified: false });
    expect(await screen.findByText(/Verify your identity to view audit records/i)).toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalledWith('/admin/activity', expect.anything());
  });
  it('sends the chosen from date and goes back to page 1', async () => {
    setup();
    fireEvent.change(await screen.findByLabelText('From'), { target: { value: '2026-10-01' } });
    await screen.findByText('No activity matches these filters.');
    expect(apiClient.get).toHaveBeenLastCalledWith('/admin/activity', {
      params: { from: '2026-10-01', to: undefined, page: 1, page_size: 25 },
    });
  });
});
