import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createQueryClient } from '../../../lib/queries/queryClient';
import { apiClient } from '../../../lib/api/client';
import { AboutPage } from './AboutPage';

vi.mock('../../../components/site/Seo', () => ({ Seo: () => null }));

function setup() {
  return render(
    <QueryClientProvider
      client={createQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AboutPage', () => {
  it('renders the page hero and breadcrumb', () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(new Promise(() => {}));
    setup();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
  });
  it('shows the photo slot with accessible description', () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(new Promise(() => {}));
    setup();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
  it('requests both editable page blocks', async () => {
    const get = vi
      .spyOn(apiClient, 'get')
      .mockResolvedValue({ id: '1', key: 'about_story', title: '', body: '' });
    setup();
    expect(await screen.findAllByText('client to supply')).toHaveLength(2);
    expect(get).toHaveBeenCalledWith('/public/pages/about_story', { params: { lang: 'en' } });
    expect(get).toHaveBeenCalledWith('/public/pages/about_credentials', { params: { lang: 'en' } });
  });
  it('announces a content query error', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('error'));
    setup();
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
  });
});
