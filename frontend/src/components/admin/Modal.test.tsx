import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  it('is a labelled modal dialog with a title, subtitle and content', () => {
    render(
      <Modal id="m-title" title="Resolve alert" subtitle="Check the visit first" onClose={vi.fn()}>
        <p>Body text</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Resolve alert' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Check the visit first')).toBeInTheDocument();
    expect(screen.getByText('Body text')).toBeInTheDocument();
  });

  it('closes from the Close button and from Escape', async () => {
    const onClose = vi.fn();
    render(
      <Modal id="m-title" title="Hide photo" onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('moves focus into the dialog and gives it back when it closes', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(
      <Modal id="m-title" title="Focus" onClose={vi.fn()}>
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('accepts extra class names and a custom close label', () => {
    render(
      <Modal id="m-title" title="Photo" className="wide" closeLabel="Done" onClose={vi.fn()}>
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveClass('wide');
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });
});
