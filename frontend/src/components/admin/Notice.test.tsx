import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Notice } from './Notice';

describe('Notice', () => {
  it('announces errors as alerts', () => {
    render(<Notice tone="error">Could not save</Notice>);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
    expect(screen.getByRole('alert')).toHaveAttribute('data-tone', 'error');
  });

  it('announces information and success politely as status', () => {
    render(
      <>
        <Notice>Saved</Notice>
        <Notice tone="success">Approved</Notice>
      </>,
    );
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });

  it('can drop the live region for static notes', () => {
    render(<Notice role={null}>Photos are private by default.</Notice>);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Photos are private by default.')).toBeInTheDocument();
  });

  it('lets the caller override the role', () => {
    render(<Notice role="alert">Heads up</Notice>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
