import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PriceCard } from './PriceCard';

describe('PriceCard', () => {
  it('renders content passed by the pricing record', () => {
    render(<PriceCard tag="Approach" title="Your quote" text="Content supplied by the client." />);
    expect(screen.getByRole('heading', { name: 'Your quote' })).toBeInTheDocument();
    expect(screen.getByText('Content supplied by the client.')).toBeInTheDocument();
  });
  it('does not invent price copy', () => {
    render(<PriceCard tag="Approach" title="Your quote" text="" />);
    expect(screen.queryByText(/UGX|shillings|per hour/i)).not.toBeInTheDocument();
  });
  it('applies featured styling when requested', () => {
    const { container } = render(<PriceCard tag="Approach" title="Your quote" text="" featured />);
    expect(container.firstElementChild?.getAttribute('class')).toContain('featured');
  });
  it('renders the tag as a paragraph', () => {
    render(<PriceCard tag="Approach" title="Your quote" text="" />);
    expect(screen.getByText('Approach').tagName).toBe('P');
  });
});
