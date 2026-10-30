import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { apiClient } from '../../../lib/api/client';
import { createQueryClient } from '../../../lib/queries/queryClient';
import { FaqPage } from './FaqPage';

vi.mock('../../../components/site/Seo', () => ({ Seo: () => null }));
function setup() {
  return render(
    <QueryClientProvider
      client={createQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <FaqPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('FaqPage', () => {
  it('renders page heading and the two content areas', () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(new Promise(() => {}));
    setup();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Care tips' })).toBeInTheDocument();
  });
  it('renders FAQs from the API in native details accordions', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue([
      {
        id: 'f1',
        question: 'Question from content?',
        answer: 'Answer from content.',
        service_id: null,
        sort_order: 1,
      },
    ]);
    setup();
    expect(await screen.findByText('Question from content?')).toBeInTheDocument();
    expect(screen.getByText('Answer from content.')).toBeInTheDocument();
  });
  it('links published articles to their detail route', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue([
      {
        id: 'a1',
        slug: 'care-at-home',
        title: 'Article from content',
        body: 'Body',
        image_media_id: null,
        published_at: '2026-10-01T00:00:00Z',
      },
    ]);
    setup();
    expect(await screen.findByRole('link', { name: 'Article from content' })).toHaveAttribute(
      'href',
      '/faq/care-at-home',
    );
  });
  it('announces failures without fabricating FAQ content', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('failed'));
    setup();
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(screen.queryByText(/How quickly can care start/)).not.toBeInTheDocument();
  });
});
