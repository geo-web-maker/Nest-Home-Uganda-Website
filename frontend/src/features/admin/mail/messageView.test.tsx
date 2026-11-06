import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MailMessageView } from '../../../shared/mail-rich/react/MailMessageView';
import type { MailMessageView as Message } from '../../../shared/mail-rich/core/types';
import { AdminMailUiProvider } from './mailUiKit';

const message = (extra: Partial<Message> = {}): Message => ({
  mailbox_message_id: 'a', message_id: 'b', folder: 'inbox', from_address: 'x@example.com', from_name: null,
  subject: 'Hi', body_format: 'html', body_text: 'plain', body_html: '<p>Hello</p>', quoted_html: null, snippet: '',
  recipients: [], attachments: [], render_notes: { removed_tags: true }, has_remote_images: false, can_download_original: true, ...extra,
} as Message);

const show = (m: Message, props: Record<string, unknown> = {}) =>
  render(<AdminMailUiProvider><MailMessageView message={m} onDownload={() => undefined} onDownloadOriginal={() => undefined} {...props} /></AdminMailUiProvider>);

describe('message view layout', () => {
  it('no longer announces removed unsafe content', () => {
    show(message());
    expect(screen.queryByText(/unsafe or unsupported/i)).toBeNull();
  });

  it('keeps view options and the original download in a closable More list', () => {
    show(message());
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByRole('menuitemradio', { name: 'Formatted' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('menuitem', { name: 'Download original message' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes after choosing a view, and when tapping outside', () => {
    show(message());
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Plain text' }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByText('plain')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows images as a one-line strip that disappears after Show images', () => {
    const reveal = vi.fn();
    show(message({ has_remote_images: true }), { showRemoteImages: reveal });
    fireEvent.click(screen.getByRole('button', { name: 'Show images' }));
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Show images' })).toBeNull();
  });

  it('shows no toolbar at all for a plain message with nothing extra', () => {
    const { container } = show(message({ body_html: null, can_download_original: false, render_notes: {} }));
    expect(container.querySelector('.mr-message-bar')).toBeNull();
  });
});
