import { render, screen } from '@testing-library/react';
import { Badge, StatusBadge, statusTone } from './Badge';

describe('Badge', () => {
  it('shows its text and defaults to the default tone', () => {
    render(<Badge>Live</Badge>);
    expect(screen.getByText('Live')).toHaveAttribute('data-tone', 'default');
  });

  it.each(['new', 'blue', 'purple', 'red', 'muted'] as const)('supports the %s tone', (tone) => {
    render(<Badge tone={tone}>Status</Badge>);
    expect(screen.getByText('Status')).toHaveAttribute('data-tone', tone);
  });
});

describe('statusTone', () => {
  it.each([
    ['open', 'red'],
    ['critical', 'red'],
    ['Cancelled', 'red'],
    ['completed', 'default'],
    ['approved', 'default'],
    ['active', 'default'],
    ['scheduled', 'new'],
    ['in progress', 'new'],
    ['warning', 'new'],
    ['muted', 'muted'],
    ['something else', 'muted'],
    [undefined, 'muted'],
  ])('maps %s to %s', (status, tone) => {
    expect(statusTone(status)).toBe(tone);
  });
});

describe('StatusBadge', () => {
  it('shows its text in the tone for the status', () => {
    render(<StatusBadge status="resolved">Resolved</StatusBadge>);
    expect(screen.getByText('Resolved')).toHaveAttribute('data-tone', 'default');
  });
});
