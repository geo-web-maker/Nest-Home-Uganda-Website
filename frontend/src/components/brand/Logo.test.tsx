import { render, screen } from '@testing-library/react';
import { Logo } from './Logo';

describe('Logo', () => {
  it('gives the logo an accessible name from its text', () => {
    render(<Logo name="Nest Home Care" subtitle="Uganda · Kampala" />);
    expect(screen.getByText(/Nest Home Care/)).toBeInTheDocument();
    expect(screen.getByText('Uganda · Kampala')).toBeInTheDocument();
  });

  it('hides the svg mark from assistive technology', () => {
    const { container } = render(
      <Logo name="Nest Admin" subtitle="Home Care Uganda" variant="admin" />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '30');
    expect(svg?.querySelectorAll('path')).toHaveLength(2);
  });

  it('draws three nest arcs on the site variant', () => {
    const { container } = render(<Logo name="Nest Home Care" subtitle="Uganda · Kampala" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '36');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 40 34');
    const arcs = svg?.querySelectorAll('path')[1]?.getAttribute('d') ?? '';
    expect(arcs.match(/M/g)).toHaveLength(3);
  });
});
