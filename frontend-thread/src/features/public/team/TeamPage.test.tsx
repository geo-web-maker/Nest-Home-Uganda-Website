import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { apiClient } from '../../../lib/api/client';
import { createQueryClient } from '../../../lib/queries/queryClient';
import { TeamPage } from './TeamPage';

vi.mock('../../../components/site/Seo', () => ({ Seo: () => null }));

function setup() {
  return render(
    <QueryClientProvider
      client={createQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <TeamPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TeamPage', () => {
  it('renders the page title and breadcrumb', () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(new Promise(() => {}));
    setup();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
  });
  it('shows only public team fields and card placeholders', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue([
      {
        id: 't1',
        name: 'Name from API',
        role: 'Role from API',
        qualification: 'Qualification from API',
        photo_media_id: 'a'.repeat(24),
      },
    ]);
    setup();
    expect(await screen.findByRole('heading', { name: 'Name from API' })).toBeInTheDocument();
    expect(screen.getByText('Role from API · Qualification from API')).toBeInTheDocument();
    expect(screen.queryByText(/registration number/i)).not.toBeInTheDocument();
  });
  it('requests the published team endpoint', () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue([]);
    setup();
    expect(get).toHaveBeenCalledWith('/public/team', { params: { lang: 'en' } });
  });
  it('shows an alert and retry action on failure', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('failed'));
    setup();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
