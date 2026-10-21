import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api/client';
import { useAuth } from '../auth/useAuth';
import { ReportsPage } from './ReportsPage';

vi.mock('../../../lib/api/client', () => ({ apiClient: { get: vi.fn() } }));
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
  signIn(['reports:read', 'reports:export']);
});

const summary = {
  enquiries_this_month: 0,
  reached_assessment_percent: 0,
  average_first_reply_minutes: null,
  applications_count: 0,
  most_requested_services: [],
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ReportsPage', () => {
  it('renders summary metric values', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      ...summary,
      enquiries_this_month: 7,
      reached_assessment_percent: 50,
      average_first_reply_minutes: 12,
      applications_count: 3,
    });
    setup();
    expect(await screen.findByText('7')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('12 minutes')).toBeInTheDocument();
  });

  it('offers CSV and Excel export formats', () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(summary);
    setup();
    expect(screen.getByRole('option', { name: 'CSV' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Excel workbook' })).toBeInTheDocument();
  });

  it('shows a summary endpoint error', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('offline'));
    setup();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('renders the service popularity chart when returned', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      ...summary,
      most_requested_services: [{ name: 'Home support', count: 4, percentage: 80 }],
    });
    setup();
    expect(await screen.findByText('Home support')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('disables the export button without the export scope', async () => {
    signIn(['reports:read']);
    vi.mocked(apiClient.get).mockResolvedValueOnce(summary);
    setup();
    expect(await screen.findByRole('button', { name: 'Export report' })).toBeDisabled();
  });
});
