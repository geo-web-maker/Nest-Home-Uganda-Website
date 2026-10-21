import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ServiceDetailPage } from './ServiceDetailPage';
import { apiClient } from '../../../lib/api/client';
vi.mock('../../../lib/queries/services', () => ({
  useServices: () => ({ data: [{ id: '1', name: 'Postnatal care' }] }),
  useService: () => ({
    data: {
      id: '1',
      slug: 'postnatal-newborn-care',
      name: 'Postnatal care',
      summary: 'Summary',
      number: 1,
      icon_key: null,
      photo_media_id: null,
      hero_label: 'Mother and baby',
      hero_headline: 'Postnatal care at home',
      hero_lead: 'A nurse supports your family.',
      facts: ['Fact one', 'Fact two', 'Fact three'],
      who_for: ['New mothers'],
      includes: ['Feeding support'],
      how_often: 'As agreed',
      seo_title: 'Postnatal care',
      seo_description: 'Care at home',
      related: [],
    },
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('../../../lib/api/client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/services/postnatal-newborn-care']}>
        <Routes>
          <Route path="/services/:slug" element={<ServiceDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('ServiceDetailPage', () => {
  it('renders the detail heading and facts', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Postnatal care at home' })).toBeInTheDocument();
    expect(screen.getByText('Fact one')).toBeInTheDocument();
  });
  it('shows the booking form with the service title', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Book this care' })).toBeInTheDocument();
  });
  it('renders who-for and includes sections from content', () => {
    setup();
    expect(screen.getByText('New mothers')).toBeInTheDocument();
    expect(screen.getByText('Feeding support')).toBeInTheDocument();
  });
  it('shows a message when no linked FAQs are supplied', () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce([]);
    setup();
    const faqBlock = screen
      .getByRole('heading', { name: 'Common questions' })
      .closest('section') as HTMLElement;
    expect(within(faqBlock).getByText('client to supply')).toBeInTheDocument();
  });
});
