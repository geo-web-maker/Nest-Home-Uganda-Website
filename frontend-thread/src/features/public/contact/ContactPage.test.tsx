import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { apiClient } from '../../../lib/api/client';
import { createQueryClient } from '../../../lib/queries/queryClient';
import { ContactPage } from './ContactPage';

vi.mock('../../../components/site/Seo', () => ({ Seo: () => null }));
vi.mock('../../../lib/queries/services', () => ({
  useServices: () => ({ data: [{ id: 's1', name: 'Postnatal and newborn care' }] }),
}));

function setup() {
  return render(
    <QueryClientProvider
      client={createQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ContactPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ContactPage', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockReturnValue(new Promise(() => {}));
  });

  it('has one h1 from spec 5.11', () => {
    setup();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Talk to us today.');
  });

  it('shows the big call and WhatsApp buttons built from the site settings', () => {
    setup();
    expect(screen.getByRole('link', { name: 'Call 0787 499 988' })).toHaveAttribute(
      'href',
      'tel:+256787499988',
    );
    expect(screen.getByRole('link', { name: 'WhatsApp us' })).toHaveAttribute(
      'href',
      expect.stringContaining('256787499988'),
    );
  });

  it('shows the office card and hides the hours card until hours exist', () => {
    setup();
    expect(screen.getByText('Office')).toBeInTheDocument();
    expect(screen.getByText('Kampala, Uganda')).toBeInTheDocument();
    expect(screen.queryByText('Hours')).not.toBeInTheDocument();
  });

  it('renders the booking form and the map slot, with no call-to-action band', () => {
    setup();
    expect(screen.getByRole('button', { name: /send request/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Map of our office' })).toBeInTheDocument();
    expect(screen.queryByText('Book your free assessment.')).not.toBeInTheDocument();
  });
});
