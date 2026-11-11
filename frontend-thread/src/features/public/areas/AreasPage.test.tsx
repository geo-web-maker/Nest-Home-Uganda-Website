import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { apiClient } from '../../../lib/api/client';
import { createQueryClient } from '../../../lib/queries/queryClient';
import { AreasPage } from './AreasPage';

vi.mock('../../../components/site/Seo', () => ({ Seo: () => null }));
function setup() {
  return render(
    <QueryClientProvider
      client={createQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <AreasPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AreasPage', () => {
  it('renders the areas page hero and map placeholder', () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(new Promise(() => {}));
    setup();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
  it('renders areas returned by the API', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue([
      { id: '1', name: 'Kampala Central', sort_order: 1, aliases: [] },
    ]);
    setup();
    expect(await screen.findByText('Kampala Central')).toBeInTheDocument();
  });
  it('does not hard-code the default area list in the page', () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue([]);
    setup();
    expect(screen.queryByText('Kampala Central')).not.toBeInTheDocument();
  });
  it('announces an endpoint failure with retry action', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('failed'));
    setup();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
