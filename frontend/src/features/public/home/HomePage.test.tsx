import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HomePage } from './HomePage';
import { apiClient } from '../../../lib/api/client';
vi.mock('../../../lib/api/client', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('../../../lib/queries/services', () => ({
  useServices: () => ({ data: [], isError: false }),
}));
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('HomePage', () => {
  it('renders the home hero and its two actions', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Care that comes home to you.',
    );
    for (const link of screen.getAllByRole('link', { name: 'Book a home visit' }))
      expect(link).toHaveAttribute('href', '/contact');
    const servicesLink = screen.getByRole('link', { name: 'Our services' });
    expect(servicesLink).toHaveAttribute('href', '/services');
    const hero = screen.getByRole('heading', { level: 1 }).closest('section');
    expect(hero).not.toBeNull();
    const primary = within(hero as HTMLElement).getByRole('link', { name: 'Book a home visit' });
    expect(primary.querySelector('[aria-hidden="true"]')).toHaveTextContent('→');
    expect(servicesLink).toHaveAttribute('data-variant', 'forest');
  });
  it('renders the promise and process sections', () => {
    setup();
    expect(
      screen.getByRole('heading', { name: /Home-based care for Ugandan families/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /From first call to first visit/ }),
    ).toBeInTheDocument();
  });
  it('does not invent testimonials when settings are absent', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (path: string) =>
      path === '/public/site' ? {} : [],
    );
    setup();
    await screen.findByRole('heading', { name: /From first call to first visit/ });
    expect(
      screen.queryByRole('heading', { name: 'Families share their experience' }),
    ).not.toBeInTheDocument();
  });
  it('shows content loaded from published team when the settings permit it', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (path: string) =>
      path === '/public/site'
        ? { home: { show_team: true, show_testimonials: false } }
        : [
            {
              id: 't1',
              name: 'Nurse A',
              role: 'Nurse',
              qualification: 'Registered',
              photo_media_id: null,
            },
          ],
    );
    setup();
    expect(await screen.findByText('Nurse A')).toBeInTheDocument();
  });
});
