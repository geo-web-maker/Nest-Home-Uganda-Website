import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JobDetailPage } from './JobDetailPage';
import { apiClient } from '../../../lib/api/client';
vi.mock('../../../lib/api/client', () => ({ apiClient: { get: vi.fn() } }));
function setup(path = '/careers/job-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/careers/:id" element={<JobDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('JobDetailPage', () => {
  it('loads job detail by id', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      id: 'job-1',
      title: 'Registered Nurse',
      department: 'clinical',
      location: 'Kampala',
      type: 'full_time',
      description: 'client to supply',
      requirements: 'client to supply',
      closes_on: null,
      registration_required: true,
    });
    setup();
    expect(await screen.findByRole('heading', { name: 'Registered Nurse' })).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/public/jobs/job-1', { params: { lang: 'en' } });
  });
  it('uses the supplied-content placeholder in requirements', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      id: 'job-1',
      title: 'Registered Nurse',
      department: 'clinical',
      location: 'Kampala',
      type: 'full_time',
      description: 'client to supply',
      requirements: 'client to supply',
      closes_on: null,
      registration_required: true,
    });
    setup();
    expect(await screen.findAllByText('client to supply')).toHaveLength(2);
  });
  it('shows retry on endpoint failure', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('offline'));
    setup();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
  it('shows the general-interest form without asking for a job called general', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce([]);
    setup('/careers/general');
    expect(await screen.findByRole('button', { name: 'Send application' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Register your interest');
    expect(apiClient.get).not.toHaveBeenCalledWith('/public/jobs/general', expect.anything());
  });
});
