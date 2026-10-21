import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('shows its text and defaults to the default tone', () => {
    render(<Badge>Live</Badge>);
    expect(screen.getByText('Live')).toHaveAttribute('data-tone', 'default');
  });

  it.each(['new', 'blue', 'purple', 'red'] as const)('supports the %s tone', (tone) => {
    render(<Badge tone={tone}>Status</Badge>);
    expect(screen.getByText('Status')).toHaveAttribute('data-tone', tone);
  });
});
