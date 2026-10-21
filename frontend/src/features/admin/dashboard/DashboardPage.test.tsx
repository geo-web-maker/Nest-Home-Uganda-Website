import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api/client';
import { DashboardPage } from './DashboardPage';
vi.mock('../../../lib/api/client', () => ({ apiClient: { get: vi.fn() } }));
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('DashboardPage', () => {
  it('loads dashboard metrics from the admin endpoint', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      stats: {
        new_enquiries_this_week: 2,
        unanswered_over_reminder_minutes: 1,
        applications_waiting: 3,
        care_started_this_month: 4,
        reminder_minutes: 30,
      },
      enquiries_per_day: [],
      needs_reply: [],
      applications_waiting_by_job: [],
    });
    setup();
    expect(await screen.findByText('New enquiries this week')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });
  it('links to the enquiries list', () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      stats: {
        new_enquiries_this_week: 0,
        unanswered_over_reminder_minutes: 0,
        applications_waiting: 0,
        care_started_this_month: 0,
        reminder_minutes: 30,
      },
      enquiries_per_day: [],
      needs_reply: [],
      applications_waiting_by_job: [],
    });
    setup();
    expect(screen.getByRole('link', { name: 'View enquiries' })).toHaveAttribute(
      'href',
      '/admin/enquiries',
    );
  });
  it('renders daily counts from returned data', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      stats: {
        new_enquiries_this_week: 0,
        unanswered_over_reminder_minutes: 0,
        applications_waiting: 0,
        care_started_this_month: 0,
        reminder_minutes: 30,
      },
      enquiries_per_day: [{ date: '20 Oct', count: 5 }],
      needs_reply: [],
      applications_waiting_by_job: [],
    });
    setup();
    expect(await screen.findByText('20 Oct')).toBeInTheDocument();
  });
  it('offers retry after an endpoint error', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('offline'));
    setup();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
