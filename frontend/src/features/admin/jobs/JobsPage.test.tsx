import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api/client';
import { useAuth } from '../auth/useAuth';
import { JobsPage } from './JobsPage';
import { JobEditorPage } from './JobEditorPage';

vi.mock('../../../lib/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
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

const job = {
  id: '1',
  title: { en: 'Registered Nurse' },
  department: 'clinical',
  location: 'Kampala',
  type: 'full_time',
  description: { en: 'd' },
  requirements: { en: 'r' },
  closes_on: null,
  registration_required: false,
  show_closing: true,
  published: false,
  closed_at: null,
  applicants_count: 2,
};

function setup(path = '/admin/careers') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/careers" element={<JobsPage />} />
          <Route path="/admin/careers/new" element={<JobEditorPage />} />
          <Route path="/admin/careers/:id" element={<JobEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(apiClient.post).mockReset();
  vi.mocked(apiClient.patch).mockReset();
  signIn(['jobs:read', 'jobs:write']);
});

describe('JobsPage', () => {
  it('shows the new job action with the write scope', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 25 });
    setup();
    expect(screen.getByRole('link', { name: 'New job' })).toHaveAttribute(
      'href',
      '/admin/careers/new',
    );
  });
  it('hides the new job action without the write scope', async () => {
    signIn(['jobs:read']);
    vi.mocked(apiClient.get).mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 25 });
    setup();
    await screen.findByText('No jobs found.');
    expect(screen.queryByRole('link', { name: 'New job' })).not.toBeInTheDocument();
  });
  it('renders jobs from the API', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      items: [job],
      total: 1,
      page: 1,
      page_size: 25,
    });
    setup();
    expect(await screen.findByText('Registered Nurse')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });
  it('shows the empty state', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 25 });
    setup();
    expect(await screen.findByText('No jobs found.')).toBeInTheDocument();
  });
  it('reports a load error with a retry button', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('offline'));
    setup();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('JobEditorPage', () => {
  it('does not fetch on /careers/new and saves a draft', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(job);
    vi.mocked(apiClient.post).mockResolvedValue(job);
    setup('/admin/careers/new');
    const user = userEvent.setup();
    expect(apiClient.get).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/^Job title/), 'Nurse');
    await user.type(screen.getByLabelText(/^Location/), 'Kampala');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(apiClient.post).toHaveBeenCalledWith(
      '/admin/jobs',
      expect.objectContaining({ title: { en: 'Nurse' }, location: 'Kampala', published: false }),
    );
  });
  it('loads an existing job into the form', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(job);
    setup('/admin/careers/1');
    expect(await screen.findByDisplayValue('Registered Nurse')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/admin/jobs/1');
  });
  it('saves then publishes when the publish box is ticked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(job);
    vi.mocked(apiClient.patch).mockResolvedValue(job);
    vi.mocked(apiClient.post).mockResolvedValue({ ...job, published: true });
    setup('/admin/careers/1');
    const user = userEvent.setup();
    await screen.findByDisplayValue('Registered Nurse');
    await user.click(screen.getByLabelText('Publish this job'));
    await user.click(screen.getByRole('button', { name: 'Save and publish' }));
    expect(apiClient.patch).toHaveBeenCalledWith(
      '/admin/jobs/1',
      expect.objectContaining({ title: { en: 'Registered Nurse' } }),
    );
    expect(apiClient.post).toHaveBeenCalledWith('/admin/jobs/1/publish', {});
  });
  it('closes a job', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(job);
    vi.mocked(apiClient.post).mockResolvedValue(job);
    setup('/admin/careers/1');
    const user = userEvent.setup();
    await screen.findByDisplayValue('Registered Nurse');
    await user.click(screen.getByRole('button', { name: 'Close job' }));
    expect(apiClient.post).toHaveBeenCalledWith('/admin/jobs/1/close', {});
  });
  it('is read-only without the write scope', async () => {
    signIn(['jobs:read']);
    vi.mocked(apiClient.get).mockResolvedValue(job);
    setup('/admin/careers/1');
    expect(await screen.findByDisplayValue('Registered Nurse')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close job' })).toBeDisabled();
  });
  it('shows a save error', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(job);
    vi.mocked(apiClient.patch).mockRejectedValue(new Error('fail'));
    setup('/admin/careers/1');
    const user = userEvent.setup();
    await screen.findByDisplayValue('Registered Nurse');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('We could not save this job.')).toBeInTheDocument();
  });
});
