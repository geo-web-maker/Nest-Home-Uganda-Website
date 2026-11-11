import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Rings } from './Rings';

const items = [
  { id: 'a', title: 'Trusted', text: 'Qualified nurses' },
  { id: 'b', title: 'Reliable', text: 'Every visit' },
  { id: 'c', title: 'Compassionate', text: 'Care with dignity' },
];

describe('Rings', () => {
  it('renders each title and description', () => {
    render(<Rings items={items} label="Our promise" />);
    expect(screen.getByText('Trusted')).toBeInTheDocument();
    expect(screen.getByText('Care with dignity')).toBeInTheDocument();
  });
  it('labels the list for assistive technology', () => {
    render(<Rings items={items} label="Our promise" />);
    expect(screen.getByRole('list', { name: 'Our promise' })).toBeInTheDocument();
  });
  it('renders the items in their supplied order', () => {
    render(<Rings items={items} label="Our promise" />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Trusted',
      'Reliable',
      'Compassionate',
    ]);
  });
  it('renders an empty list without throwing', () => {
    render(<Rings items={[]} label="Our promise" />);
    expect(screen.getByRole('list', { name: 'Our promise' }).children).toHaveLength(0);
  });
});
