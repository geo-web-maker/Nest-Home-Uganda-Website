import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Strip } from './Strip';

describe('Strip', () => {
  it('renders a single supplied message', () => {
    render(<Strip text="Home visits across supplied areas" />);
    expect(screen.getByText('Home visits across supplied areas')).toBeInTheDocument();
  });
  it('renders all supplied facts', () => {
    render(<Strip items={['Fact one', 'Fact two', 'Fact three']} />);
    expect(screen.getByText('Fact three')).toBeInTheDocument();
  });
  it('uses an optional accessible label', () => {
    render(<Strip text="Facts" label="Home facts" />);
    expect(screen.getByLabelText('Home facts')).toBeInTheDocument();
  });
  it('does not add facts when no values are supplied', () => {
    const { container } = render(<Strip />);
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });
});
