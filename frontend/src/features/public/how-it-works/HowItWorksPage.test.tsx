import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { apiClient } from '../../../lib/api/client';
import { createQueryClient } from '../../../lib/queries/queryClient';
import { HowItWorksPage } from './HowItWorksPage';

vi.mock('../../../components/site/Seo', () => ({ Seo: () => null }));
function setup() {
  return render(
    <QueryClientProvider
      client={createQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <HowItWorksPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('HowItWorksPage', () => {
  it('renders the page hero and process steps', () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(new Promise(() => {}));
    setup();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'How home care works' })).toBeInTheDocument();
  });
  it('loads pricing blocks from the public pricing endpoint', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue([
      {
        id: '1',
        key: 'assessment',
        tag: 'Start here',
        title: 'Free assessment',
        text: 'Text from content',
        price_text: '',
        sort_order: 1,
      },
    ]);
    setup();
    expect(await screen.findByRole('heading', { name: 'Free assessment' })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/public/pricing', { params: { lang: 'en' } });
  });
  it('does not invent a price when the content has no price text', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue([
      {
        id: '1',
        key: 'plan',
        tag: '',
        title: 'Your care plan',
        text: 'Text',
        price_text: '',
        sort_order: 3,
      },
    ]);
    setup();
    await screen.findByRole('heading', { name: 'Your care plan' });
    expect(screen.queryByText(/UGX|\$\d|per hour/i)).not.toBeInTheDocument();
  });
  it('announces an API failure and offers a retry', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('failed'));
    setup();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
