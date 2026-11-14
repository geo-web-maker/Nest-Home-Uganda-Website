/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

  it('floats and can be dismissed', () => {
    const onDismiss = vi.fn();
    render(<Notice tone="error" floating onDismiss={onDismiss}>Could not save</Notice>);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses a success toast by itself but keeps errors until closed', () => {
    vi.useFakeTimers();
    const done = vi.fn();
    const failed = vi.fn();
    render(<><Notice tone="success" floating onDismiss={done}>Saved</Notice><Notice tone="error" floating onDismiss={failed}>Failed</Notice></>);
    vi.advanceTimersByTime(7000);
    vi.useRealTimers();
    expect(done).toHaveBeenCalledTimes(1);
    expect(failed).not.toHaveBeenCalled();
  });
});
