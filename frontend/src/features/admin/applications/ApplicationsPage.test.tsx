import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api/client';
import { ApplicationsPage } from './ApplicationsPage';
vi.mock('../../../lib/api/client', () => ({ apiClient: { get: vi.fn() } }));
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('ApplicationsPage', () => {
  it('shows the pipeline filter tabs', () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 25 });
    setup();
    expect(screen.getByRole('tablist', { name: 'Filter by stage' })).toBeInTheDocument();
  });
  it('renders applications from the API', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      items: [
        {
          id: 'a',
          name: 'Mary Atim',
          job_id: 'j',
          job_title: 'Registered Nurse',
          experience_years: 4,
          stage: 'received',
          rating: 4,
          applied_at: '2026-10-20T10:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 25,
    });
    setup();
    expect(await screen.findByText('Mary Atim')).toBeInTheDocument();
  });
  it('shows the empty state', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 25 });
    setup();
    expect(await screen.findByText('No applications found.')).toBeInTheDocument();
  });
  it('reports a list error', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('offline'));
    setup();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
  it('asks the API for one stage when a tab is chosen', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25 });
    setup();
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'Shortlisted' }));
    await screen.findByText('No applications found.');
    expect(apiClient.get).toHaveBeenLastCalledWith('/admin/applications', {
      params: { stage: 'shortlisted', page: 1, page_size: 25 },
    });
  });
});
