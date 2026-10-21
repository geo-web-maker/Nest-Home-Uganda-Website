import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../../lib/queries/queryClient';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Footer } from './Footer';

function setup() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Footer', () => {
  it('shows the brand column with tagline, office and a tel link', () => {
    setup();
    expect(screen.getByText('Trusted · Reliable · Compassionate.')).toBeInTheDocument();
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
      ['Our team', '/team'],
      ['Areas we serve', '/areas'],
      ['FAQ and care tips', '/faq'],
    ] as const) {
      expect(within(explore).getByRole('link', { name })).toHaveAttribute('href', href);
    }
  });

  it('has the Company links', () => {
    setup();
    const company = screen.getByRole('navigation', { name: 'Company' });
    for (const [name, href] of [
      ['About us', '/about'],
      ['Careers', '/careers'],
      ['Contact', '/contact'],
      ['Privacy and terms', '/privacy'],
    ] as const) {
      expect(within(company).getByRole('link', { name })).toHaveAttribute('href', href);
    }
  });

  it('ends with the copyright line', () => {
    setup();
    expect(screen.getByText('© Nest Home Care Uganda')).toBeInTheDocument();
  });
});
