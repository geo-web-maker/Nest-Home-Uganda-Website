import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { apiClient } from '../../../lib/api/client';
import { MailPage } from './MailPage';

vi.mock('../../../lib/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const box = { id: 'b1', address: 'amina@mail.test', display_name: 'Amina', unread_count: 1 };
const unread = {
  mailbox_message_id: 'm1',
  message_id: 'msg1',
  folder: 'inbox',
  from_address: 'ruth@mail.test',
  from_name: 'Ruth',
  subject: 'Rota change',
  body_text: 'Please swap Tuesday.',
  origin: 'inbound',
  received_at: '2026-10-30T08:00:00Z',
  is_read: false,
  is_starred: false,
};
const detail = {
  ...unread,
  recipients: [
    { kind: 'to', address: 'amina@mail.test' },
    { kind: 'cc', address: 'sam@mail.test' },
  ],
  attachments: [{ id: 'a1', filename: 'rota.pdf', content_type: 'application/pdf', size_bytes: 2048, scan_state: 'unscanned' }],
};

function api(options: { items?: unknown[]; boxes?: unknown[]; detail?: unknown } = {}) {
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path === '/mail/mailboxes') return { items: options.boxes ?? [box] };
    if (path.endsWith('/messages')) return { items: options.items ?? [unread] };
    if (path.startsWith('/mail/messages/')) return options.detail ?? detail;
    if (path.endsWith('/download')) return { download_url: 'https://files.test/rota.pdf' };
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.patch).mockResolvedValue({});
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => (path === '/mail/drafts' ? { id: 'd1' } : {}));
  vi.mocked(apiClient.put).mockResolvedValue({});
  vi.mocked(apiClient.delete).mockResolvedValue(undefined);
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MailPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const listCalls = () => vi.mocked(apiClient.get).mock.calls.filter(([path]) => String(path).endsWith('/messages')).length;
const reader = () => screen.getByRole('article', { name: 'Message' });

beforeEach(() => vi.resetAllMocks());

describe('MailPage', () => {
  it('lists the inbox with an unread marker and the unread count on the Inbox tab', async () => {
    api();
    setup();
    expect(await screen.findByText('Rota change')).toBeInTheDocument();
    expect(screen.getByText('Unread')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Inbox (1)' })).toHaveAttribute('aria-selected', 'true');
    expect(apiClient.get).toHaveBeenCalledWith('/mail/mailboxes/b1/messages', { params: { folder: 'inbox', q: undefined } });
  });

  it('shows a message with its sender, recipients, external warning and attachment, and refreshes the list once because it is now read', async () => {
    api();
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: /Rota change/ }));
    const pane = within(reader());
    expect(await pane.findByText('Please swap Tuesday.')).toBeInTheDocument();
    expect(pane.getByText(/came from an external address/)).toBeInTheDocument();
    expect(pane.getByText(/Cc: sam@mail.test/)).toBeInTheDocument();
    expect(pane.getByText(/rota.pdf · 2 KB/)).toBeInTheDocument();
    await waitFor(() => expect(listCalls()).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(listCalls()).toBe(2);
  });

  it('downloads an attachment through a fresh signed link in a new tab', async () => {
    api();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: /Rota change/ }));
    await user.click(await within(reader()).findByRole('button', { name: 'Download' }));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://files.test/rota.pdf', '_blank', 'noopener,noreferrer'));
    expect(apiClient.get).toHaveBeenCalledWith('/mail/attachments/a1/download');
    open.mockRestore();
  });

  it('stars a message with a PATCH and keeps it open', async () => {
    api();
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: /Rota change/ }));
    await user.click(await within(reader()).findByRole('button', { name: 'Star' }));
    expect(apiClient.patch).toHaveBeenCalledWith('/mail/messages/m1', { is_starred: true });
    expect(within(reader()).getByText('Please swap Tuesday.')).toBeInTheDocument();
  });

  it('moves a message to trash and returns to the select prompt', async () => {
    api();
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: /Rota change/ }));
    await user.click(await within(reader()).findByRole('button', { name: 'Move to trash' }));
    expect(apiClient.patch).toHaveBeenCalledWith('/mail/messages/m1', { folder: 'trash' });
    expect(await screen.findByText('Select a message to read it.')).toBeInTheDocument();
  });

  it('offers Move to inbox instead of Move to trash inside Trash', async () => {
    api({ items: [{ ...unread, folder: 'trash', is_read: true }] });
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('tab', { name: /Trash/ }));
    await user.click(await screen.findByRole('button', { name: /Rota change/ }));
    expect(await within(reader()).findByRole('button', { name: 'Move to inbox' })).toBeInTheDocument();
    expect(within(reader()).queryByRole('button', { name: 'Move to trash' })).toBeNull();
  });

  it('reports spam with the report-spam endpoint for external mail', async () => {
    api();
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: /Rota change/ }));
    await user.click(await within(reader()).findByRole('button', { name: 'Report spam' }));
    expect(apiClient.post).toHaveBeenCalledWith('/mail/messages/m1/report-spam');
  });

  it('switches folder and asks the server for that folder', async () => {
    api();
    const user = userEvent.setup();
    setup();
    await screen.findByText('Rota change');
    await user.click(screen.getByRole('tab', { name: 'Sent' }));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/mail/mailboxes/b1/messages', { params: { folder: 'sent', q: undefined } }));
  });

  it('searches and shows the search-specific empty state', async () => {
    api();
    const user = userEvent.setup();
    setup();
    await screen.findByText('Rota change');
    vi.mocked(apiClient.get).mockImplementation(async (path: string) => (path === '/mail/mailboxes' ? { items: [box] } : { items: [] }));
    await user.type(screen.getByRole('searchbox', { name: 'Search messages' }), 'payroll{Enter}');
    expect(await screen.findByText('No messages match your search.')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/mail/mailboxes/b1/messages', { params: { folder: 'inbox', q: 'payroll' } });
  });

  it('replies with the recipient, subject, thread link and quoted text filled in, then sends through one draft', async () => {
    api();
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: /Rota change/ }));
    await user.click(await within(reader()).findByRole('button', { name: 'Reply' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compose' });
    expect(within(dialog).getByLabelText('To')).toHaveValue('ruth@mail.test');
    expect(within(dialog).getByLabelText('Subject')).toHaveValue('Re: Rota change');
    expect((within(dialog).getByLabelText('Message') as HTMLTextAreaElement).value).toContain('> Please swap Tuesday.');
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/mail/drafts/d1/send', { mailbox_id: 'b1' }));
    expect(apiClient.post).toHaveBeenCalledWith('/mail/drafts', expect.objectContaining({ mailbox_id: 'b1', to: ['ruth@mail.test'], subject: 'Re: Rota change', in_reply_to: 'msg1' }));
    expect(await screen.findByText('Message sent.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('forwards with no recipient and keeps Send off until one is typed', async () => {
    api();
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: /Rota change/ }));
    await user.click(await within(reader()).findByRole('button', { name: 'Forward' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compose' });
    expect(within(dialog).getByLabelText('Subject')).toHaveValue('Fwd: Rota change');
    expect(within(dialog).getByRole('button', { name: 'Send' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('To'), 'sam@mail.test');
    expect(within(dialog).getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('names a bad address, blocks Send, and shows Cc and Bcc only when asked', async () => {
    api();
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Compose' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compose' });
    expect(within(dialog).queryByLabelText('Bcc')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Add Cc or Bcc' }));
    expect(within(dialog).getByLabelText('Bcc')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('To'), 'not-an-address');
    await user.type(within(dialog).getByLabelText('Subject'), 'Hi');
    await user.type(within(dialog).getByLabelText('Message'), 'Body');
    expect(within(dialog).getByText('Check these addresses: not-an-address')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('shows an error inside the dialog when sending fails and keeps what was typed', async () => {
    api();
    vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
      if (path === '/mail/drafts') return { id: 'd1' };
      throw new Error('boom');
    });
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Compose' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compose' });
    await user.type(within(dialog).getByLabelText('To'), 'sam@mail.test');
    await user.type(within(dialog).getByLabelText('Subject'), 'Hi');
    await user.type(within(dialog).getByLabelText('Message'), 'Body');
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(await within(dialog).findByText(/could not be sent/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Message')).toHaveValue('Body');
  });

  it('reopens a draft for editing and sends it through the same draft id', async () => {
    api({ items: [{ ...unread, folder: 'drafts', is_read: true, origin: 'internal' }], detail: { ...detail, origin: 'internal', recipients: [{ kind: 'to', address: 'sam@mail.test' }], attachments: [] } });
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('tab', { name: 'Drafts' }));
    await user.click(await screen.findByRole('button', { name: /Rota change/ }));
    await user.click(await within(reader()).findByRole('button', { name: 'Compose' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compose' });
    expect(within(dialog).getByLabelText('To')).toHaveValue('sam@mail.test');
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith('/mail/drafts/m1', expect.objectContaining({ to: ['sam@mail.test'] })));
    expect(apiClient.post).toHaveBeenCalledWith('/mail/drafts/m1/send', { mailbox_id: 'b1' });
    expect(apiClient.post).not.toHaveBeenCalledWith('/mail/drafts', expect.anything());
  });

  it('saves a draft without sending it', async () => {
    api();
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Compose' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compose' });
    await user.type(within(dialog).getByLabelText('Subject'), 'Later');
    await user.click(within(dialog).getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Draft saved.')).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith('/mail/drafts', expect.objectContaining({ subject: 'Later' }));
    expect(apiClient.post).not.toHaveBeenCalledWith('/mail/drafts/d1/send', expect.anything());
  });

  it('deletes a draft that was already saved on the server', async () => {
    api({ items: [{ ...unread, folder: 'drafts', is_read: true, origin: 'internal' }], detail: { ...detail, origin: 'internal', recipients: [], attachments: [] } });
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('tab', { name: 'Drafts' }));
    await user.click(await screen.findByRole('button', { name: /Rota change/ }));
    await user.click(await within(reader()).findByRole('button', { name: 'Compose' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compose' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete draft' }));
    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith('/mail/drafts/m1'));
    expect(await screen.findByText('Draft deleted.')).toBeInTheDocument();
  });

  it('opens Compose from the keyboard, but not while typing in the search box', async () => {
    api();
    const user = userEvent.setup();
    setup();
    await screen.findByText('Rota change');
    await user.click(screen.getByRole('searchbox', { name: 'Search messages' }));
    await user.keyboard('c');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(document.body);
    await user.keyboard('c');
    expect(await screen.findByRole('dialog', { name: 'Compose' })).toBeInTheDocument();
  });

  it('tells a person without a mailbox what to do and disables Compose', async () => {
    api({ boxes: [], items: [] });
    setup();
    expect(await screen.findByText(/do not have a mailbox yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compose' })).toBeDisabled();
  });

  it('shows one error message when mail cannot load', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('down'));
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('Mail is unavailable');
  });

  it('shows a mailbox picker only when there is more than one mailbox', async () => {
    api({ boxes: [box, { id: 'b2', address: 'office@mail.test', display_name: 'Office', unread_count: 0 }] });
    setup();
    expect(await screen.findByLabelText('Mailbox')).toBeInTheDocument();
  });

  it('shows the files already on a draft being edited and removes one with DELETE', async () => {
    api({ items: [{ ...unread, folder: 'drafts', is_read: true, origin: 'internal' }], detail: { ...detail, origin: 'internal', recipients: [{ kind: 'to', address: 'sam@mail.test' }] } });
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('tab', { name: 'Drafts' }));
    await user.click(await screen.findByRole('button', { name: /Rota change/ }));
    await user.click(await within(reader()).findByRole('button', { name: 'Compose' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compose' });
    expect(within(dialog).getByText(/rota.pdf · 2 KB/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Remove rota.pdf' }));
    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith('/mail/drafts/m1/attachments/a1'));
    await waitFor(() => expect(within(dialog).queryByText(/rota.pdf/)).toBeNull());
  });

  it('keeps the file in the list and says so when removing it fails', async () => {
    api({ items: [{ ...unread, folder: 'drafts', is_read: true, origin: 'internal' }], detail: { ...detail, origin: 'internal', recipients: [] } });
    vi.mocked(apiClient.delete).mockRejectedValue(new Error('no'));
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('tab', { name: 'Drafts' }));
    await user.click(await screen.findByRole('button', { name: /Rota change/ }));
    await user.click(await within(reader()).findByRole('button', { name: 'Compose' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compose' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove rota.pdf' }));
    expect(await within(dialog).findByText(/could not be saved/)).toBeInTheDocument();
    expect(within(dialog).getByText(/rota.pdf/)).toBeInTheDocument();
  });
});
