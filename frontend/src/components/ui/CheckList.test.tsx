import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CheckList } from './CheckList';

const items = [
  { id: 'a', text: 'Client-supplied item A' },
  { id: 'b', text: 'Client-supplied item B' },
];

describe('CheckList', () => {
  it('renders the supplied checklist items', () => {
    render(<CheckList items={items} label="Visit includes" />);
    expect(screen.getByText('Client-supplied item A')).toBeInTheDocument();
    expect(screen.getByText('Client-supplied item B')).toBeInTheDocument();
  });
  it('exposes a labelled list', () => {
    render(<CheckList items={items} label="Visit includes" />);
    expect(screen.getByRole('list', { name: 'Visit includes' })).toBeInTheDocument();
  });
  it('hides decorative diamonds from assistive technology', () => {
    const { container } = render(<CheckList items={items} label="Visit includes" />);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });
  it('supports an empty list without adding invented rows', () => {
    render(<CheckList items={[]} label="Visit includes" />);
    expect(screen.getByRole('list', { name: 'Visit includes' }).children).toHaveLength(0);
  });
});
