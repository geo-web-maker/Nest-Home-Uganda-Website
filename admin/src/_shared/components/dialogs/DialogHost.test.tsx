/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dialogs } from '../../lib/dialogs';
import { DialogHost } from './DialogHost';

describe('DialogHost danger confirm', () => {
  it('focuses Cancel and marks the confirm button as danger', async () => {
    render(<DialogHost />);
    const answer = dialogs.confirm('Delete it?', { confirmLabel: 'Delete', danger: true });
    expect(await screen.findByRole('button', { name: 'Delete' })).toHaveAttribute('data-variant', 'danger');
    // The modal's own close control is also named Cancel; the footer one is the last in the DOM.
    const cancel = screen.getAllByRole('button', { name: 'Cancel' }).at(-1)!;
    expect(cancel).toHaveFocus();
    await userEvent.click(cancel);
    await expect(answer).resolves.toBe(false);
  });

  it('keeps the primary confirm focused when the action is not destructive', async () => {
    render(<DialogHost />);
    const answer = dialogs.confirm('Send it?', { confirmLabel: 'Send' });
    expect(await screen.findByRole('button', { name: 'Send' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await expect(answer).resolves.toBe(true);
  });
});
