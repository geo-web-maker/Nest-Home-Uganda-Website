import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api/client';
import { ContentPage } from './ContentPage';
vi.mock('../../../lib/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));
vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'u',
      name: 'Editor',
      email: 'editor@example.invalid',
      scopes: ['content:read', 'content:write', 'content:publish'],
      is_superadmin: false,
    },
  }),
}));
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ContentPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('ContentPage', () => {
  it('renders content manager tabs', () => {
    setup();
    expect(screen.getByRole('tab', { name: 'Services' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Media' })).toBeInTheDocument();
  });
  it('loads and displays service records', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      items: [
        { id: 's', slug: 'care', name: { en: 'Care service' }, published: true, sort_order: 1 },
      ],
      total: 1,
      page: 1,
      page_size: 100,
    });
    setup();
    expect(await screen.findByText('Care service')).toBeInTheDocument();
  });
  it('shows an empty state when the selected tab has no entries', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      page_size: 100,
    });
    setup();
    expect(await screen.findByText('No content found.')).toBeInTheDocument();
  });
  it('announces list errors', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('offline'));
    setup();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
