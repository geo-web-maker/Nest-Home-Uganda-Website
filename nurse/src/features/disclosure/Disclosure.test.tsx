import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Disclosure } from './Disclosure';

describe('Disclosure', () => {
  it('renders supplied disclosure items without inventing permission behavior', () => {
    render(<Disclosure title="What is captured" items={[{ label: 'When', text: 'Only on an action.' }]} onAccept={vi.fn()} showAction={false} />);
    expect(screen.getByText('What is captured')).toBeInTheDocument();
    expect(screen.getByText('Only on an action.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
