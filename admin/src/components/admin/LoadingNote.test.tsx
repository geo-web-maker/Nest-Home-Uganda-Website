import { render, screen } from '@testing-library/react';
import { LoadingNote } from './LoadingNote';

describe('LoadingNote', () => {
  it('is a busy status region named by its text', () => {
    render(<LoadingNote>Loading flags…</LoadingNote>);
    const note = screen.getByRole('status');
    expect(note).toHaveTextContent('Loading flags…');
    expect(note).toHaveAttribute('aria-busy', 'true');
  });
});
