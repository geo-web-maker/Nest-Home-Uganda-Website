import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../lib/queries/queryClient';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { trackClick } from '../../features/public/booking/bookingApi';
import { StickyBar } from './StickyBar';

vi.mock('../../features/public/booking/bookingApi', () => ({ trackClick: vi.fn() }));

function setup(path = '/services') {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <StickyBar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StickyBar', () => {
  beforeEach(() => vi.mocked(trackClick).mockClear());

  it('has Call now (tel) and WhatsApp (wa.me, new tab) links', () => {
    setup();
    expect(screen.getByRole('link', { name: 'Call now' })).toHaveAttribute(
      'href',
      'tel:+256787499988',
    );
    const wa = screen.getByRole('link', { name: 'WhatsApp' });
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/256787499988\?text=/);
    expect(wa).toHaveAttribute('target', '_blank');
    expect(wa).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('tracks a call click with the current page', async () => {
    setup('/services');
    await userEvent.click(screen.getByRole('link', { name: 'Call now' }));
    expect(trackClick).toHaveBeenCalledWith('call', '/services', expect.any(String));
  });

  it('tracks a WhatsApp click with the current page', async () => {
    setup('/about');
    await userEvent.click(screen.getByRole('link', { name: 'WhatsApp' }));
    expect(trackClick).toHaveBeenCalledWith('whatsapp', '/about', expect.any(String));
  });

  it('uses the whatsapp and primary button variants', () => {
    setup();
    expect(screen.getByRole('link', { name: 'Call now' })).toHaveAttribute(
      'data-variant',
      'primary',
    );
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'data-variant',
      'whatsapp',
    );
  });
});
