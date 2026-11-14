import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MailMessageView } from '../../../shared/mail-rich/react/MailMessageView';
import type { MailDelivery, MailMessageView as Message } from '../../../shared/mail-rich/core/types';
import { AdminMailUiProvider } from './mailUiKit';

const base = (delivery: MailDelivery): Message => ({
  mailbox_message_id: 'a', message_id: 'b', folder: 'sent', from_address: 'info@bhcug.com', from_name: null,
  subject: 'Hi', body_format: 'plain', body_text: 'x', body_html: null, quoted_html: null, snippet: '',
  recipients: [], attachments: [], render_notes: {}, has_remote_images: false, can_download_original: false, delivery,
} as Message);

const show = (delivery: MailDelivery, retry?: () => Promise<void>) =>
  render(<AdminMailUiProvider><MailMessageView message={base(delivery)} onDownload={() => undefined} onRetryDelivery={retry} /></AdminMailUiProvider>);

describe('delivery panel', () => {
  it('shows the real error, attempts and a working Retry now for a deferred send', async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    show({ state: 'deferred', reason: 'Delivery needs attention.', detail: 'SMTPSenderRefused', attempts: 3,
      next_attempt_at: '2026-11-07T10:00:00Z', can_retry: true, recipients: [] }, retry);
    expect(screen.getByText('SMTPSenderRefused')).toBeTruthy();
    expect(screen.getByText('Deferred')).toBeTruthy();
    expect(screen.getByText(/Attempts: 3/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
  });

  it('hides Retry now once the message is sent', () => {
    show({ state: 'sent', can_retry: false, recipients: [] }, vi.fn());
    expect(screen.queryByRole('button', { name: 'Retry now' })).toBeNull();
  });
});
