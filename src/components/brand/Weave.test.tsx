import { render } from '@testing-library/react';
import { Weave } from './Weave';

describe('Weave', () => {
  it('is a decorative svg with the spec viewBox', () => {
    const { container } = render(<Weave />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('viewBox', '0 0 1200 46');
    expect(svg).toHaveAttribute('preserveAspectRatio', 'none');
    expect(svg?.querySelectorAll('path')).toHaveLength(2);
  });
});
