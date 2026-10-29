import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../lib/queries/queryClient';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Footer } from './Footer';

function setup(initialEntry = '/') {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Footer />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Footer', () => {
  it('shows the brand logo with tagline, office and a tel link', () => {
    setup();
    expect(screen.getByText('Trusted · Reliable · Compassionate.')).toBeInTheDocument();
    expect(screen.getByText('Well Nest Home Care Uganda')).toBeInTheDocument();
    expect(screen.getByText('Uganda · Kampala')).toBeInTheDocument();
    expect(screen.getByText(/Office: Kampala, Uganda/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '0787 499 988' })).toHaveAttribute(
      'href',
      'tel:+256787499988',
    );
  });

  it('has the Explore links', () => {
    setup();
    const explore = screen.getByRole('navigation', { name: 'Explore' });
    for (const [name, href] of [
      ['Services', '/services'],
      ['How it works', '/how-it-works'],
      ['Contact', '/contact'],
    ] as const) {
      expect(within(explore).getByRole('link', { name })).toHaveAttribute('href', href);
    }
  });

  it('has the Company links', () => {
    setup();
    const company = screen.getByRole('navigation', { name: 'Company' });
    for (const [name, href] of [
      ['Our team', '/team'],
      ['Areas we serve', '/areas'],
      ['FAQ and care tips', '/faq'],
      ['About us', '/about'],
      ['Privacy and terms', '/privacy'],
      ['Staff login', '/admin/login'],
    ] as const) {
      expect(within(company).getByRole('link', { name })).toHaveAttribute('href', href);
    }
    expect(within(company).queryByRole('link', { name: 'Careers' })).not.toBeInTheDocument();
  });

  it('marks the current footer destination', () => {
    setup('/team');
    const company = screen.getByRole('navigation', { name: 'Company' });
    expect(within(company).getByRole('link', { name: 'Our team' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('ends with the copyright line', () => {
    setup();
    expect(screen.getByText('© Well Nest Home Care Uganda Ltd')).toBeInTheDocument();
  });
});
