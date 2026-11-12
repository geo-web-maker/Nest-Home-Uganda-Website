import { render, screen } from '@testing-library/react';
import { Rule } from './Rule';

describe('Rule', () => {
  it('shows the label text', () => {
    render(<Rule>What we do</Rule>);
    expect(screen.getByText('What we do')).toBeInTheDocument();
  });

  it('hides the decorative line and diamond', () => {
    const { container } = render(<Rule>Services</Rule>);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });
});
