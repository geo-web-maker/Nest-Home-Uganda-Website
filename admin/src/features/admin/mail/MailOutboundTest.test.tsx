import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiClient } from '@shared/lib/api/client';
import { MailOutboundTest } from './MailOutboundTest';

vi.mock('@shared/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/lib/api/client')>();
  return { ...actual, apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(), getBlob: vi.fn() } };
});

const renderIt = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <MailOutboundTest />
    </QueryClientProvider>,
  );

beforeEach(() => vi.resetAllMocks());

describe('MailOutboundTest', () => {
  it('keeps external send disabled until the recipient is valid, then reports console-only honestly', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      sent: false,
      queued: false,
      provider: 'console',
      attachment_included: false,
      message: 'The console provider records messages but sends nothing externally.',
    });
    const user = userEvent.setup();
    renderIt();
    const send = screen.getByRole('button', { name: 'Send external test' });
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText('External test recipient'), 'me@mail.test');
    expect(send).toBeEnabled();
    await user.click(send);
    expect(apiClient.post).toHaveBeenCalledWith('/mail/settings/test-send', { to: 'me@mail.test', include_attachment: true });
    expect(await screen.findByText(/console provider records messages but sends nothing externally/i)).toBeInTheDocument();
  });
});
