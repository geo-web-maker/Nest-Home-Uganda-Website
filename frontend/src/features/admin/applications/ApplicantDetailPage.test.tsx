import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api/client';
import { useAuth } from '../auth/useAuth';
import { ApplicantDetailPage } from './ApplicantDetailPage';

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
  signIn(['applications:read', 'applications:write']);
});

const sample = {
  id: 'a',
  name: 'Mary Atim',
  job_id: 'j',
  job_title: 'Registered Nurse',
  experience_years: 4,
  stage: 'received',
  rating: 4,
  applied_at: '2026-10-20T10:00:00Z',
  phone_e164: '+256787499988',
  email: 'applicant@example.invalid',
  registration_number: 'client to supply',
  qualification: 'client to supply',
  area: 'Kampala',
  availability: 'client to supply',
  cover_note: '',
  cv_file_name: 'cv.pdf',
  cv_available: true,
  decline_reason: null,
  answers: {},
  events: [],
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/applications/a']}>
        <Routes>
          <Route path="/admin/applications/:id" element={<ApplicantDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ApplicantDetailPage', () => {
  it('shows applicant information and review controls', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(sample);
    setup();
    expect(await screen.findByRole('heading', { name: 'Mary Atim' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View CV' })).toBeEnabled();
    expect(screen.getByLabelText('Stage')).toBeInTheDocument();
  });

  it('shows errors from the applicant endpoint', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('offline'));
    setup();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('asks for a reason when declined is selected and blocks saving until it is filled', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(sample);
    setup();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Stage'), 'declined');
    const reason = await screen.findByLabelText(/^Reason for declining/);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await user.type(reason, 'Not registered');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('saves a stage change with no decline reason', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(sample);
    vi.mocked(apiClient.patch).mockResolvedValue(sample);
    setup();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Stage'), 'shortlisted');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(apiClient.patch).toHaveBeenCalledWith('/admin/applications/a', {
      stage: 'shortlisted',
      rating: 4,
      decline_reason: null,
    });
  });

  it('adds a note', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(sample);
    vi.mocked(apiClient.post).mockResolvedValue(sample);
    setup();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^Add a note/), 'Called, no answer');
    await user.click(screen.getByRole('button', { name: 'Save note' }));
    expect(apiClient.post).toHaveBeenCalledWith('/admin/applications/a/notes', {
      text: 'Called, no answer',
    });
  });

  it('leaves the forms read-only without the write scope', async () => {
    signIn(['applications:read']);
    vi.mocked(apiClient.get).mockResolvedValue(sample);
    setup();
    expect(await screen.findByLabelText('Stage')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled();
  });
});
