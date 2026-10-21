import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api/client';
import { ActivityPage } from './ActivityPage';
vi.mock('../../../lib/api/client', () => ({ apiClient: { get: vi.fn() } }));
function setup() {
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
  it('renders a read-only activity table', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 25 });
    setup();
    expect(await screen.findByText('No activity matches these filters.')).toBeInTheDocument();
  });
  it('renders returned event data', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      items: [
        {
          id: 'a',
          at: '2026-10-20T10:00:00Z',
          user_name: 'Staff',
          action: 'Updated settings',
          item_type: 'settings',
          item_label: 'Business',
        },
      ],
      total: 1,
      page: 1,
      page_size: 25,
    });
    setup();
    expect(await screen.findByText('Updated settings')).toBeInTheDocument();
    expect(screen.getByText('Staff')).toBeInTheDocument();
  });
  it('sends date filters to the API', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 25 });
    setup();
    expect(await screen.findByText('No activity matches these filters.')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/admin/activity', {
      params: { from: undefined, to: undefined, page: 1, page_size: 25 },
    });
  });
  it('shows an alert after request failure', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('offline'));
    setup();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
  it('sends the chosen from date and goes back to page 1', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25 });
    setup();
    fireEvent.change(await screen.findByLabelText('From'), { target: { value: '2026-10-01' } });
    await screen.findByText('No activity matches these filters.');
    expect(apiClient.get).toHaveBeenLastCalledWith('/admin/activity', {
      params: { from: '2026-10-01', to: undefined, page: 1, page_size: 25 },
    });
  });
});
