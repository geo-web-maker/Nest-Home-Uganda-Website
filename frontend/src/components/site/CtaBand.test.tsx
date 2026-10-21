import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { trackClick } from '../../features/public/booking/bookingApi';
import { createQueryClient } from '../../lib/queries/queryClient';
import { CtaBand } from './CtaBand';

vi.mock('../../features/public/booking/bookingApi', () => ({ trackClick: vi.fn() }));

function setup() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/services']}>
        <CtaBand
          heading="Not sure which care you need?"
          bookLabel="Book a home visit"
          whatsappLabel="WhatsApp us"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CtaBand', () => {
  beforeEach(() => vi.mocked(trackClick).mockClear());

  it('shows the heading as an h2', () => {
    setup();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Not sure which care you need?' }),
    ).toBeInTheDocument();
  });

  it('links the primary button to /contact', () => {
    setup();
    const book = screen.getByRole('link', { name: 'Book a home visit' });
    expect(book).toHaveAttribute('href', '/contact');
    expect(book).toHaveAttribute('data-variant', 'primary');
  });

  it('links WhatsApp to wa.me in a new tab', () => {
    setup();
    const wa = screen.getByRole('link', { name: 'WhatsApp us' });
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/256787499988\?text=/);
    expect(wa).toHaveAttribute('target', '_blank');
    expect(wa).toHaveAttribute('data-variant', 'whatsapp');
  });

  it('tracks the WhatsApp click with the current page', async () => {
    setup();
    await userEvent.click(screen.getByRole('link', { name: 'WhatsApp us' }));
    expect(trackClick).toHaveBeenCalledWith('whatsapp', '/services', expect.any(String));
  });
});
