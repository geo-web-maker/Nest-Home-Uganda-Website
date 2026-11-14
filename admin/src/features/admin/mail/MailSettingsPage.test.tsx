import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { apiClient } from '@shared/lib/api/client';
import { MailSettingsPage } from './MailSettingsPage';

vi.mock('../../../lib/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(), getBlob: vi.fn() },
}));

const items = [
  { key: 'mail.enabled', group: 'General', label: 'Mail enabled', help: 'Turns mail on.', type: 'boolean', default: false, value: false, is_secret: false },
  { key: 'mail.max_attachment_mb', group: 'Limits', label: 'Largest attachment (MB)', help: 'Per file.', type: 'integer', default: 10, value: 10, is_secret: false, minimum: 1, maximum: 50 },
  { key: 'mail.blocked_extensions', group: 'Limits', label: 'Blocked extensions', help: '', type: 'list', default: ['exe'], value: ['exe', 'bat'], is_secret: false },
  { key: 'mail.provider', group: 'Provider', label: 'Provider', help: '', type: 'string', default: 'console', value: 'console', is_secret: false, choices: ['console', 'resend', 'brevo'] },
  { key: 'mail.resend_api_key', group: 'Provider', label: 'Resend API key', help: '', type: 'string', default: '', is_secret: true, is_set: true },
];
const usage = { today: 4, month: 40, queue: { queued: 1, deferred: 2, failed: 3 }, top_mailboxes: [{ local_part: 'office', sent: 9 }] };

function api(options: { settingsFail?: boolean } = {}) {
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path === '/mail/settings') {
      if (options.settingsFail) throw new Error('totp required');
      return { items };
    }
    if (path === '/mail/totp/status') return { enabled: true, verified: !options.settingsFail };
    if (path === '/mail/usage') return usage;
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.patch).mockResolvedValue({});
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path === '/mail/backfill/preview') return { count: 2, sample: ['amina', 'ruth'] };
    if (path === '/mail/backfill/run') return { created: 2, skipped: [{}] };
    if (path === '/mail/totp/enroll') return { secret: 'JBSWY3DPEHPK3PXP' };
    if (path === '/mail/totp/confirm') return { recovery_codes: ['AAAA-1111', 'BBBB-2222'] };
    if (path === '/mail/settings/test-send') return { sent: false, queued: false, provider: 'console', attachment_included: false, message: 'The console provider records messages but sends nothing externally.' };
    return {};
  });
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MailSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.resetAllMocks());

describe('MailSettingsPage', () => {
  it('groups settings under their group headings and fills each input from the stored value', async () => {
    api();
    setup();
    expect(await screen.findByLabelText('Largest attachment (MB)')).toHaveValue(10);
    expect(screen.getByRole('region', { name: 'Limits' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Provider' })).toBeInTheDocument();
    expect(screen.getByLabelText('Blocked extensions')).toHaveValue('exe, bat');
    expect(screen.getByRole('combobox', { name: 'Provider' })).toHaveValue('console');
    expect(screen.getByRole('checkbox', { name: 'Mail enabled' })).not.toBeChecked();
  });

  it('never shows a stored secret and says only whether one is set', async () => {
    api();
    setup();
    const field = await screen.findByLabelText('Resend API key');
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveValue('');
    expect(field).toHaveAttribute('placeholder', 'Secret is set. Enter a replacement to change it.');
  });

  it('saves a whole number as a number, one setting at a time', async () => {
    api();
    const user = userEvent.setup();
    setup();
    const field = await screen.findByLabelText('Largest attachment (MB)');
    await user.clear(field);
    await user.type(field, '25');
    await user.click(screen.getByRole('button', { name: 'Save: Largest attachment (MB)' }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/mail/settings', { values: { 'mail.max_attachment_mb': 25 } }));
    expect(await screen.findByText('Setting saved.')).toBeInTheDocument();
  });

  it('saves a list as an array and a switch as a boolean', async () => {
    api();
    const user = userEvent.setup();
    setup();
    const list = await screen.findByLabelText('Blocked extensions');
    await user.clear(list);
    await user.type(list, 'exe, js ,');
    await user.click(screen.getByRole('button', { name: 'Save: Blocked extensions' }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/mail/settings', { values: { 'mail.blocked_extensions': ['exe', 'js'] } }));
    await user.click(screen.getByRole('checkbox', { name: 'Mail enabled' }));
    await user.click(screen.getByRole('button', { name: 'Save: Mail enabled' }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/mail/settings', { values: { 'mail.enabled': true } }));
  });

  it('does not send an empty number, and says so', async () => {
    api();
    const user = userEvent.setup();
    setup();
    const field = await screen.findByLabelText('Largest attachment (MB)');
    await user.clear(field);
    await user.click(screen.getByRole('button', { name: 'Save: Largest attachment (MB)' }));
    expect(await screen.findByText('The setting could not be saved.')).toBeInTheDocument();
    expect(apiClient.patch).not.toHaveBeenCalled();
  });

  it('sends a typed secret and clears the box afterwards', async () => {
    api();
    const user = userEvent.setup();
    setup();
    const field = await screen.findByLabelText('Resend API key');
    await user.type(field, 're_live_123');
    await user.click(screen.getByRole('button', { name: 'Save: Resend API key' }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/mail/settings', { values: { 'mail.resend_api_key': 're_live_123' } }));
    await waitFor(() => expect(screen.getByLabelText('Resend API key')).toHaveValue(''));
  });

  it('resets one setting to its default', async () => {
    api();
    const user = userEvent.setup();
    setup();
    await screen.findByRole('combobox', { name: 'Provider' });
    await user.click(screen.getByRole('button', { name: 'Reset to default: Provider' }));
    expect(apiClient.post).toHaveBeenCalledWith('/mail/settings/mail.provider/reset');
    expect(await screen.findByText('Setting reset to its default.')).toBeInTheDocument();
  });

  it('previews the backfill, asks in a dialog instead of window.confirm, then runs it', async () => {
    api();
    const confirm = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Preview missing mailboxes' }));
    expect(await screen.findByText('2 mailbox(es) will be created.')).toBeInTheDocument();
    expect(screen.getByText('amina, ruth')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Run backfill' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create mailboxes?' });
    expect(apiClient.post).not.toHaveBeenCalledWith('/mail/backfill/run', expect.anything());
    await user.click(within(dialog).getByRole('button', { name: 'Create mailboxes' }));
    expect(await screen.findByText('Created 2 mailbox(es); 1 skipped.')).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    confirm.mockRestore();
  });

  it('cancels the backfill dialog with Escape and runs nothing', async () => {
    api();
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Preview missing mailboxes' }));
    await user.click(await screen.findByRole('button', { name: 'Run backfill' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(apiClient.post).not.toHaveBeenCalledWith('/mail/backfill/run', expect.anything());
  });

  it('shows usage, queue counts and the busiest mailboxes', async () => {
    api();
    setup();
    expect(await screen.findByText('Today: 4 · This month: 40')).toBeInTheDocument();
    expect(screen.getByText('Queued: 1 · Deferred: 2 · Failed: 3')).toBeInTheDocument();
    expect(screen.getByText('office: 9')).toBeInTheDocument();
  });

  it('keeps external send disabled until the recipient is valid, then reports console-only honestly', async () => {
    api();
    const user = userEvent.setup();
    setup();
    const send = await screen.findByRole('button', { name: 'Send external test' });
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText('External test recipient'), 'me@mail.test');
    await user.click(send);
    expect(apiClient.post).toHaveBeenCalledWith('/mail/settings/test-send', { to: 'me@mail.test', include_attachment: true });
    expect(await screen.findByText(/console provider records messages but sends nothing externally/i)).toBeInTheDocument();
  });
});
