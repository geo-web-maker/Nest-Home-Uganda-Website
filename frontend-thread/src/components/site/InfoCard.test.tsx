import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfoCard } from './InfoCard';

describe('InfoCard', () => {
  it('renders the label and value', () => {
    render(<InfoCard label="Office" value="Kampala, Uganda" />);
    expect(screen.getByText('Office')).toBeInTheDocument();
    expect(screen.getByText('Kampala, Uganda')).toBeInTheDocument();
  });
  it('uses a link only when a href is provided', () => {
    render(<InfoCard label="Phone" value="0787 499 988" href="tel:+256787499988" />);
    expect(screen.getByRole('link', { name: '0787 499 988' })).toHaveAttribute(
      'href',
      'tel:+256787499988',
    );
  });
  it('renders plain values as text', () => {
    render(<InfoCard label="Hours" value="Add opening hours" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
  it('handles long values without requiring a fixed width', () => {
    render(<InfoCard label="Details" value="information-that-may-be-long" />);
    expect(screen.getByText('information-that-may-be-long')).toBeInTheDocument();
  });
});
