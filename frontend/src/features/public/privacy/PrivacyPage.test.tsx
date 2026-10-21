import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrivacyPage } from './PrivacyPage';
import { apiClient } from '../../../lib/api/client';
vi.mock('../../../lib/api/client', () => ({ apiClient: { get: vi.fn() } }));
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('PrivacyPage', () => {
  it('uses the privacy page title', () => {
    setup();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your information is safe with us.' }),
    ).toBeInTheDocument();
  });
  it('uses the exact client-supplied placeholder for draft legal text', () => {
    setup();
    expect(screen.getAllByText('client to supply')).toHaveLength(6);
  });
  it('displays the legal review notice', () => {
    setup();
    expect(screen.getByText(/reviewed by a Ugandan lawyer/i)).toBeInTheDocument();
  });
  it('reports the API error without hiding draft placeholders', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('offline'));
    setup();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getAllByText('client to supply')).toHaveLength(6);
  });
});
