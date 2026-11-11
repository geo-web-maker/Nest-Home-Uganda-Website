import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CareersPage } from './CareersPage';
import { apiClient } from '../../../lib/api/client';
vi.mock('../../../lib/api/client', () => ({ apiClient: { get: vi.fn() } }));
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CareersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('CareersPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset().mockResolvedValue([]);
  });
  it('renders the reference careers hero and keeps applications on the detail flow', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Join the team.');
    expect(screen.getByRole('link', { name: 'Register your interest' })).toHaveAttribute(
      'href',
      '/careers/general#application',
    );
    expect(screen.queryByRole('heading', { name: 'Apply to join the team' })).not.toBeInTheDocument();
  });
  it('renders public job cards from the API', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce([
      {
        id: 'j1',
        title: 'Registered Nurse',
        department: 'clinical',
        location: 'Kampala',
        type: 'full_time',
        description: 'client to supply',
        requirements: 'client to supply',
        closes_on: null,
        registration_required: true,
      },
    ]);
    setup();
    expect(await screen.findByRole('heading', { name: 'Registered Nurse' })).toBeInTheDocument();
  });
  it('shows the supplied-content empty state', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce([]);
    setup();
    expect(await screen.findByText('There are no open roles at this time.')).toBeInTheDocument();
  });
  it('reports a loading error', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('offline'));
    setup();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
