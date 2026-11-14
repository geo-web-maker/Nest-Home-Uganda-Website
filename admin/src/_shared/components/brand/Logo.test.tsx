/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */
import { render, screen } from '@testing-library/react';
import { Logo, LoginMark } from './Logo';

describe('Logo', () => {
  it('gives the logo an accessible name from its text', () => {
    render(<Logo name="Bloomwell Home Care Uganda" subtitle="Uganda · Kampala" />);
    expect(screen.getByText(/Bloomwell Home Care/)).toBeInTheDocument();
    expect(screen.getByText('Uganda · Kampala')).toBeInTheDocument();
  });

  it('hides the svg mark from assistive technology', () => {
    const { container } = render(
      <Logo name="Bloomwell Home Care Uganda Admin" subtitle="Home Care Uganda" variant="admin" />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '26');
  });

  it('draws the lotus, cross and leaves on the site variant', () => {
    const { container } = render(<Logo name="Bloomwell Home Care Uganda" subtitle="Uganda · Kampala" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '32');
    expect(svg?.getAttribute('viewBox')).toBe('104 72 152 168');
    // leaves, cross and three petals
    expect(svg?.querySelectorAll('path')).toHaveLength(5);
  });

  it('keeps fixed brand colours on the sign-in mark', () => {
    const { container } = render(<LoginMark />);
    expect(container.querySelectorAll('path[fill="#08675F"]')).toHaveLength(2);
    expect(container.querySelectorAll('path')).toHaveLength(5);
  });
});
