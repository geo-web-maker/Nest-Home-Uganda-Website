import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArticlePage } from './ArticlePage';
import { apiClient } from '../../../lib/api/client';
vi.mock('../../../lib/api/client', () => ({ apiClient: { get: vi.fn() } }));
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/faq/care-guide']}>
        <Routes>
          <Route path="/faq/:slug" element={<ArticlePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('ArticlePage', () => {
  it('shows the loading state before a response', () => {
    setup();
    expect(screen.getByText('Loading questions and care tips')).toBeInTheDocument();
  });
  it('shows the returned article title and body', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      id: 'a',
      slug: 'care-guide',
      title: 'Care guide',
      summary: 'Short guide',
      body: 'First paragraph',
      image_media_id: null,
      published_at: null,
      seo_title: '',
      seo_description: '',
    });
    setup();
    expect(await screen.findByRole('heading', { name: 'Care guide' })).toBeInTheDocument();
    expect(screen.getByText('First paragraph')).toBeInTheDocument();
  });
  it('shows a retry action after an API error', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('offline'));
    setup();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
  it('uses the slug for its article query', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      id: 'a',
      slug: 'care-guide',
      title: 'Care guide',
      summary: '',
      body: '',
      image_media_id: null,
      published_at: null,
    });
    setup();
    await screen.findByRole('heading', { name: 'Care guide' });
    expect(apiClient.get).toHaveBeenCalledWith('/public/articles/care-guide', {
      params: { lang: 'en' },
    });
  });
});
