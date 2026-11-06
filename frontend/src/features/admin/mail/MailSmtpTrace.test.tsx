import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, apiClient } from '../../../lib/api/client';
import { MailSmtpTrace } from './MailSmtpTrace';

vi.mock('../../../lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api/client')>();
  return { ...actual, apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(), getBlob: vi.fn() } };
});

const renderIt = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <MailSmtpTrace />
    </QueryClientProvider>,
  );

test('shows every step, redacted credentials, the SMTP conversation and the server IP', async () => {
  vi.mocked(apiClient.post).mockResolvedValue({
    egress_ip: '203.0.113.9',
    notes: ['Brevo refused this server.'],
    steps: [
      { step: 'settings', ok: true, password: { kind: 'smtp_key', fingerprint: 'ab12cd34', length: 52 } },
      { step: 'auth', ok: false, ms: 120, smtp_code: 535, error_type: 'SMTPAuthenticationError', detail: '5.7.8 Authentication failed' },
    ],
    wire: [
      { dir: 'client', line: 'AUTH [credentials redacted]' },
      { dir: 'client', line: '[AUTH payload redacted]' },
      { dir: 'server', line: '535 5.7.8 Authentication failed' },
    ],
    versions: { aiosmtplib: '5.1.3' },
  });
  renderIt();
  await userEvent.type(screen.getByLabelText(/Key you know works/i), 'abc');
  await userEvent.click(screen.getByRole('button', { name: 'Run full trace' }));
  expect(await screen.findByText('203.0.113.9')).toBeInTheDocument();
  expect(apiClient.post).toHaveBeenCalledWith('/mail/settings/test-send/trace', { send_to: null, compare_key: 'abc' });
  expect(screen.queryByText(/xsmtpsib-secret-key/)).toBeNull();
  expect(screen.getByText(/ab12cd34/)).toBeInTheDocument();
  expect(screen.getByText(/C: AUTH \[credentials redacted\]/)).toBeInTheDocument();
  expect(screen.getByText(/AUTH data redacted/)).toBeInTheDocument();
  expect(screen.getByText(/S: 535 5\.7\.8/)).toBeInTheDocument();
  expect(screen.getByText('Brevo refused this server.')).toBeInTheDocument();
  expect(screen.getByText('FAIL')).toBeInTheDocument();
});

test('asks for the authenticator code when the server answers 403', async () => {
  vi.mocked(apiClient.post).mockRejectedValue(new ApiError(403, 'forbidden', 'Verify your authenticator code to continue.'));
  renderIt();
  await userEvent.click(screen.getByRole('button', { name: 'Run full trace' }));
  await waitFor(() => expect(screen.getByText(/Verify your authenticator code above/)).toBeInTheDocument());
});
