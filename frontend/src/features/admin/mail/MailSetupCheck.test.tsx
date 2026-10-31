import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiClient } from '../../../lib/api/client';
import { MailSetupCheck } from './MailSetupCheck';

vi.mock('../../../lib/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const passing = { checks: [{ id: 'enabled', status: 'pass', detail: 'Mail is switched on.' }, { id: 'storage', status: 'pass', detail: 'Files can be written, read and deleted.' }], summary: { pass: 2, warn: 0, fail: 0, skip: 0 } };
const mixed = {
  checks: [
    { id: 'provider', status: 'fail', detail: 'resend is selected but no API key is saved.' },
    { id: 'dnsSpf', status: 'warn', detail: 'No SPF record.' },
    { id: 'inbound', status: 'skip', detail: 'Inbound mail is off.' },
    { id: 'enabled', status: 'pass', detail: 'Mail is switched on.' },
  ],
  summary: { pass: 1, warn: 1, fail: 1, skip: 1 },
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MailSetupCheck />
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.resetAllMocks());

describe('MailSetupCheck', () => {
  it('shows nothing until asked, then lists every check with a plain name and its result', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(mixed);
    const user = userEvent.setup();
    setup();
    expect(screen.queryByRole('list')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Run setup check' }));
    const list = await screen.findByRole('list', { name: 'Setup check' });
    expect(apiClient.post).toHaveBeenCalledWith('/mail/diagnostics/run', {});
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(within(rows[0] as HTMLElement).getByText('Fail')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('Sending provider')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('resend is selected but no API key is saved.')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('Review')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('Skipped')).toBeInTheDocument();
  });

  it('summarises counts when something needs attention, as an error when anything fails', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(mixed);
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Run setup check' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('1 passed, 1 to review, 1 failing, 1 skipped.');
  });

  it('says everything works when every check passes', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(passing);
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Run setup check' }));
    expect(await screen.findByText('Everything checked is working.')).toBeInTheDocument();
  });

  it('runs the inside-Nest and inbound tests separately and adds each result under its own name', async () => {
    vi.mocked(apiClient.post).mockImplementation(async (path: string) =>
      path.endsWith('/loopback')
        ? { check: { id: 'loopback', status: 'pass', detail: 'Sending inside Nest works.' } }
        : { check: { id: 'inboundTest', status: 'fail', detail: 'Inbound mail was refused: Invalid inbound signature' } },
    );
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Test sending inside Nest' }));
    expect(await screen.findByText('Sending inside Nest works.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Test incoming mail' }));
    expect(await screen.findByText('Inbound mail was refused: Invalid inbound signature')).toBeInTheDocument();
    expect(screen.getByText('Sending inside Nest works.')).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledWith('/mail/diagnostics/loopback', {});
    expect(apiClient.post).toHaveBeenCalledWith('/mail/diagnostics/inbound', {});
  });

  it('replaces an earlier self-test result instead of listing it twice', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ check: { id: 'loopback', status: 'fail', detail: 'first' } }).mockResolvedValueOnce({ check: { id: 'loopback', status: 'pass', detail: 'second' } });
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Test sending inside Nest' }));
    await screen.findByText('first');
    await user.click(screen.getByRole('button', { name: 'Test sending inside Nest' }));
    expect(await screen.findByText('second')).toBeInTheDocument();
    expect(screen.queryByText('first')).toBeNull();
  });

  it('tells the person to verify their authenticator when the checks are refused', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('403'));
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Run setup check' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Verify your authenticator code first');
  });

  it('falls back to the raw id for a check the screen has no name for', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ checks: [{ id: 'somethingNew', status: 'warn', detail: 'x' }], summary: { pass: 0, warn: 1, fail: 0, skip: 0 } });
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Run setup check' }));
    expect(await screen.findByText('somethingNew')).toBeInTheDocument();
  });
});
