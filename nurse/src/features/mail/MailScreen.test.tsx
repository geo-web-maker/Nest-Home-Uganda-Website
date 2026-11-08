import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/api/client';
import { nurseDb } from '../../offline/db';
import { MailScreen } from './MailScreen';
import { destroyMailKey } from './mailCrypto';
import { ensureWebCrypto } from './testSupport';
import { listDrafts, putDraft } from './mailStore';

vi.mock('../../lib/api/client', () => ({ apiRequest: vi.fn() }));

const box = { id: 'b1', address: 'amina@mail.test', display_name: 'Amina', unread_count: 1 };
const unread = { mailbox_message_id: 'm1', message_id: 'g1', from_address: 'ruth@mail.test', from_name: 'Ruth', subject: 'Rota change', body_text: 'Please swap Tuesday.', origin: 'inbound', received_at: '2026-10-30T08:00:00Z', is_read: false, is_starred: false };
const full = { recipients: [], attachments: [{ id: 'a1', filename: 'rota.pdf', size_bytes: 2048 }], body_text: 'Please swap Tuesday.' };

type Call = [string, { method?: string; body?: string } | undefined];
let sendFails: unknown = null;
function api() {
  const respond = async (path: string, init?: { method?: string }): Promise<unknown> => {
    if (path === '/mail/mailboxes') return { items: [box] };
    if (path.includes('/messages?folder=')) return { items: [unread] };
    if (path === '/mail/messages/m1' && !init?.method) return full;
    if (path === '/mail/drafts') return { id: 'srv-1' };
    if (path.endsWith('/send') && sendFails) throw sendFails;
    if (path.endsWith('/download')) return { download_url: 'https://files.test/rota.pdf' };
    if (path === '/mail/attachments/presign') return { attachment_id: 'att-1', upload_url: 'https://up.test/att-1' };
    return {};
  };
  vi.mocked(apiRequest).mockImplementation(respond as typeof apiRequest);
}
const calls = () => vi.mocked(apiRequest).mock.calls as unknown as Call[];
const posted = (path: string) => calls().filter(([p, init]) => p === path && init?.method === 'POST');
const setOnline = (value: boolean) => Object.defineProperty(navigator, 'onLine', { value, configurable: true });
const button = (name: string) => screen.getByRole('button', { name });

beforeAll(ensureWebCrypto);
beforeEach(() => { vi.clearAllMocks(); sendFails = null; setOnline(true); localStorage.setItem('nest.nurse.cache-user-id', 'u1'); api(); });
afterEach(async () => { vi.unstubAllGlobals(); cleanup(); await nurseDb.meta.clear(); await destroyMailKey(); localStorage.clear(); });

async function openCompose() {
  render(<MailScreen />);
  await screen.findByText('Rota change');
  fireEvent.click(button('Compose'));
  return screen.findByRole('dialog', { name: 'Compose' });
}
const fill = async (dialog: HTMLElement, to: string, subject = 'Hello', body = 'Body') => {
  fireEvent.change(within(dialog).getByLabelText('To'), { target: { value: to } });
  fireEvent.change(within(dialog).getByLabelText('Subject'), { target: { value: subject } });
  // The message is a rich-text editor (contenteditable), so it is typed into, not assigned.
  await userEvent.type(await within(dialog).findByRole('textbox', { name: 'Message' }), body);
};
/** Press Send, then skip the undo window with "Send now" so the message goes out immediately. */
const sendNow = async (dialog: HTMLElement) => {
  fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Send now' }));
};

describe('nurse MailScreen', () => {
  it('uses the shared screen heading and lists the inbox with an unread flag', async () => {
    render(<MailScreen />);
    expect(await screen.findByRole('heading', { level: 2, name: 'Mail' })).toBeInTheDocument();
    expect(await screen.findByText('Rota change')).toBeInTheDocument();
    expect(screen.getByText('Unread')).toBeInTheDocument();
    expect(calls().some(([path]) => path === '/mail/mailboxes/b1/messages?folder=inbox')).toBe(true);
  });

  it('opens a message, warns about an external sender, marks it read and lists attachments', async () => {
    render(<MailScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /Rota change/ }));
    expect(await screen.findByText(/came from an external address/)).toBeInTheDocument();
    expect(await screen.findByText('rota.pdf')).toBeInTheDocument();
    fireEvent.click(button('Back to messages'));
    await screen.findByText('Rota change');
    expect(screen.queryByText('Unread')).toBeNull();
  });

  it('downloads an attachment through a fresh link', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<MailScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /Rota change/ }));
    await screen.findByText('rota.pdf');
    fireEvent.click(button('Download'));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://files.test/rota.pdf', '_blank', 'noopener,noreferrer'));
    open.mockRestore();
  });

  it('stars, and moves to trash, through PATCH', async () => {
    render(<MailScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /Rota change/ }));
    await screen.findByText('rota.pdf');
    fireEvent.click(button('Star'));
    await waitFor(() => expect(calls().some(([p, i]) => p === '/mail/messages/m1' && i?.method === 'PATCH' && i.body === '{"is_starred":true}')).toBe(true));
    fireEvent.click(button('Move to trash'));
    await waitFor(() => expect(calls().some(([p, i]) => p === '/mail/messages/m1' && i?.body === '{"folder":"trash"}')).toBe(true));
    expect(await screen.findByRole('group', { name: 'Mail folder' })).toBeInTheDocument();
  });

  it('reports an external message as spam through the report-spam route', async () => {
    render(<MailScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /Rota change/ }));
    await screen.findByText('rota.pdf');
    fireEvent.click(button('More options'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Report spam' }));
    await waitFor(() => expect(calls().some(([p, i]) => p === '/mail/messages/m1/report-spam' && i?.method === 'POST')).toBe(true));
  });

  it('replies with recipient, subject and thread link filled in, and sends through one server draft', async () => {
    render(<MailScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /Rota change/ }));
    await screen.findByText('rota.pdf');
    fireEvent.click(button('Reply'));
    const dialog = await screen.findByRole('dialog', { name: 'Compose' });
    expect(within(dialog).getByLabelText('To')).toHaveValue('ruth@mail.test');
    expect(within(dialog).getByLabelText('Subject')).toHaveValue('Re: Rota change');
    await sendNow(dialog);
    await waitFor(() => expect(posted('/mail/drafts/srv-1/send')).toHaveLength(1));
    expect(JSON.parse(posted('/mail/drafts')[0]?.[1]?.body ?? '{}')).toMatchObject({ mailbox_id: 'b1', to: ['ruth@mail.test'], subject: 'Re: Rota change', in_reply_to: 'g1' });
    await waitFor(async () => expect(await listDrafts('u1')).toHaveLength(0));
    expect(await screen.findByText('Message sent.')).toBeInTheDocument();
  });

  it('rejects a bad address inside the sheet and saves nothing', async () => {
    const dialog = await openCompose();
    await fill(dialog, 'not-an-address');
    await sendNow(dialog);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Check these addresses: not-an-address');
    expect(await listDrafts('u1')).toHaveLength(0);
    expect(posted('/mail/drafts')).toHaveLength(0);
  });

  it('keeps Send off until there is a recipient, subject and message', async () => {
    const dialog = await openCompose();
    expect(within(dialog).getByRole('button', { name: 'Send' })).toBeDisabled();
    await fill(dialog, 'sam@mail.test');
    expect(within(dialog).getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('closes the compose sheet with Escape', async () => {
    await openCompose();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('saves a draft on the device, and a second draft does not overwrite the first', async () => {
    let dialog = await openCompose();
    await fill(dialog, 'sam@mail.test', 'First');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft on this device' }));
    await screen.findByText('Draft saved on this device.');
    fireEvent.click(button('Compose'));
    dialog = await screen.findByRole('dialog', { name: 'Compose' });
    await fill(dialog, 'sam@mail.test', 'Second');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft on this device' }));
    await waitFor(async () => expect((await listDrafts('u1')).map((d) => d.subject).sort()).toEqual(['First', 'Second']));
    expect(posted('/mail/drafts')).toHaveLength(0);
  });

  it('queues offline, makes no request, then sends once when the connection returns', async () => {
    const dialog = await openCompose();
    setOnline(false);
    act(() => { window.dispatchEvent(new Event('offline')); });
    await fill(dialog, 'sam@mail.test');
    await sendNow(dialog);
    expect(await screen.findByText('Saved. It will send when you are back online.')).toBeInTheDocument();
    expect(await screen.findByText('Waiting to send')).toBeInTheDocument();
    expect(posted('/mail/drafts')).toHaveLength(0);
    setOnline(true);
    act(() => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(posted('/mail/drafts/srv-1/send')).toHaveLength(1));
    await waitFor(async () => expect(await listDrafts('u1')).toHaveLength(0));
    expect(posted('/mail/drafts')).toHaveLength(1);
  });

  it('keeps a message queued after a network failure and reuses the server draft on retry', async () => {
    sendFails = { status: 0, detail: 'network' };
    const dialog = await openCompose();
    await fill(dialog, 'sam@mail.test');
    await sendNow(dialog);
    await waitFor(async () => expect((await listDrafts('u1'))[0]).toMatchObject({ state: 'queued', serverDraftId: 'srv-1' }));
    sendFails = null;
    act(() => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(posted('/mail/drafts/srv-1/send').length).toBeGreaterThanOrEqual(2));
    expect(posted('/mail/drafts')).toHaveLength(1);
    await waitFor(async () => expect(await listDrafts('u1')).toHaveLength(0));
  });

  it('marks a refused message as failed instead of retrying forever, and offers Send now and Discard', async () => {
    sendFails = { status: 422, detail: 'refused' };
    const dialog = await openCompose();
    await fill(dialog, 'sam@mail.test');
    await sendNow(dialog);
    expect(await screen.findByText('Could not send')).toBeInTheDocument();
    expect(button('Send now')).toBeInTheDocument();
    expect(button('Discard')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be sent');
  });

  it('discards a draft and deletes its server copy', async () => {
    await putDraft({ id: 'd1', ownerId: 'u1', mailboxId: 'b1', to: ['sam@mail.test'], subject: 'Old', body: 'x', state: 'failed', serverDraftId: 'srv-9', savedAt: '2026-10-31T09:00:00Z' });
    render(<MailScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(calls().some(([p, i]) => p === '/mail/drafts/srv-9' && i?.method === 'DELETE')).toBe(true));
    await waitFor(async () => expect(await listDrafts('u1')).toHaveLength(0));
  });

  it("does not show another person's drafts", async () => {
    await putDraft({ id: 'd2', ownerId: 'someone-else', mailboxId: 'b9', to: ['x@mail.test'], subject: 'Private', body: 'x', state: 'queued', savedAt: '2026-10-31T09:00:00Z' });
    render(<MailScreen />);
    await screen.findByText('Rota change');
    expect(screen.queryByText('Private')).toBeNull();
    expect(posted('/mail/drafts')).toHaveLength(0);
  });

  it('offline: shows the saved messages with a warning and disables actions that need the server', async () => {
    render(<MailScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /Rota change/ }));
    await screen.findByText('rota.pdf');
    setOnline(false);
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(await screen.findByText(/Offline — showing saved messages/)).toBeInTheDocument();
    expect(button('Reply')).toBeDisabled();
    expect(button('Star')).toBeDisabled();
    fireEvent.click(button('More options'));
    expect(screen.getByRole('menuitem', { name: 'Mark unread' })).toBeDisabled();
  });

  it('says what to do when there is no mailbox', async () => {
    vi.mocked(apiRequest).mockImplementation((async (path: string) => (path === '/mail/mailboxes' ? { items: [] } : {})) as typeof apiRequest);
    render(<MailScreen />);
    expect(await screen.findByText(/do not have a mailbox yet/)).toBeInTheDocument();
    expect(button('Compose')).toBeDisabled();
  });

  it('attaches a file through one server draft, then sends the later edits with a PUT instead of a second draft', async () => {
    const upload = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', upload);
    const dialog = await openCompose();
    await fill(dialog, 'sam@mail.test', 'Rota', 'First version');
    const file = new File(['pdf'], 'rota.pdf', { type: 'application/pdf' });
    fireEvent.change(within(dialog).getByLabelText('Attach files'), { target: { files: [file] } });
    expect(await within(dialog).findByText('rota.pdf')).toBeInTheDocument();
    expect(posted('/mail/drafts')).toHaveLength(1);
    expect(posted('/mail/attachments/presign')).toHaveLength(1);
    expect(upload).toHaveBeenCalledWith('https://up.test/att-1', expect.objectContaining({ method: 'PUT' }));
    expect(posted('/mail/attachments/att-1/confirm')).toHaveLength(1);
    expect(posted('/mail/drafts/srv-1/attachments/att-1')).toHaveLength(1);
    await userEvent.type(await within(dialog).findByRole('textbox', { name: 'Message' }), ' Final version');
    await sendNow(dialog);
    await waitFor(() => expect(posted('/mail/drafts/srv-1/send')).toHaveLength(1));
    const put = calls().find(([p, i]) => p === '/mail/drafts/srv-1' && i?.method === 'PUT');
    expect(JSON.parse(put?.[1]?.body ?? '{}')).toMatchObject({ body_text: 'First version Final version' });
    expect(posted('/mail/drafts')).toHaveLength(1);
  });

  it('names the file that failed to upload and still lets the message go', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    const dialog = await openCompose();
    await fill(dialog, 'sam@mail.test');
    fireEvent.change(within(dialog).getByLabelText('Attach files'), { target: { files: [new File(['x'], 'big.pdf')] } });
    expect(await within(dialog).findByText(/big\.pdf could not be attached\./)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('disables attaching while offline and says why', async () => {
    const dialog = await openCompose();
    setOnline(false);
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(within(dialog).getByRole('button', { name: 'Attach files' })).toBeDisabled();
    expect(within(dialog).getByText('Connect to the internet to attach files.')).toBeInTheDocument();
  });

  const swipe = (row: HTMLElement, from: number, to: number, dy = 5) => {
    fireEvent.touchStart(row, { touches: [{ clientX: from, clientY: 100 }] });
    fireEvent.touchEnd(row, { changedTouches: [{ clientX: to, clientY: 100 + dy }] });
  };
  const rowItem = async () => (await screen.findByRole('button', { name: /Rota change/ })).closest('li') as HTMLElement;

  it('swipes left to trash and right to star', async () => {
    render(<MailScreen />);
    const row = await rowItem();
    swipe(row, 220, 80);
    await waitFor(() => expect(calls().some(([p, i]) => p === '/mail/messages/m1' && i?.body === '{"folder":"trash"}')).toBe(true));
    swipe(row, 60, 200);
    await waitFor(() => expect(calls().some(([p, i]) => p === '/mail/messages/m1' && i?.body === '{"is_starred":true}')).toBe(true));
  });

  it('ignores a short or mostly vertical swipe', async () => {
    render(<MailScreen />);
    const row = await rowItem();
    swipe(row, 200, 150);
    swipe(row, 200, 90, 120);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls().some(([, i]) => i?.method === 'PATCH')).toBe(false);
  });

  it('offline: a swipe makes no request and tells the person to connect', async () => {
    render(<MailScreen />);
    const row = await rowItem();
    setOnline(false);
    act(() => { window.dispatchEvent(new Event('offline')); });
    swipe(row, 220, 80);
    expect(await screen.findByText('Connect to the internet to do this.')).toBeInTheDocument();
    expect(calls().some(([, i]) => i?.method === 'PATCH')).toBe(false);
  });

  it('removes an attached file from the server draft and from the sheet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
    const dialog = await openCompose();
    await fill(dialog, 'sam@mail.test');
    fireEvent.change(within(dialog).getByLabelText('Attach files'), { target: { files: [new File(['x'], 'rota.pdf')] } });
    await within(dialog).findByText('rota.pdf');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove rota.pdf' }));
    await waitFor(() => expect(calls().some(([p, i]) => p === '/mail/drafts/srv-1/attachments/att-1' && i?.method === 'DELETE')).toBe(true));
    await waitFor(() => expect(within(dialog).queryByText('rota.pdf')).toBeNull());
  });

  it('keeps Compose off when no signed-in owner is known, so nothing is ever saved under a blank name', async () => {
    localStorage.removeItem('nest.nurse.cache-user-id');
    render(<MailScreen />);
    await screen.findByText('Rota change');
    expect(button('Compose')).toBeDisabled();
  });

  it('shows a clear message instead of losing the text when drafts cannot be stored safely', async () => {
    const dialog = await openCompose();
    await fill(dialog, 'sam@mail.test', 'Hello', 'Body');
    const real = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
    try {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save draft on this device' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('cannot keep drafts safely');
      expect(await within(dialog).findByRole('textbox', { name: 'Message' })).toHaveTextContent('Body');
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true });
    }
  });
});
