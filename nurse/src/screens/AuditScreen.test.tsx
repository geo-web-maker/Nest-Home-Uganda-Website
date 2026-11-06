import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiRequest } from '../lib/api/client';
import { AuditScreen } from './AuditScreen';
vi.mock('../lib/api/client', () => ({ apiRequest: vi.fn() }));

describe('AuditScreen TOTP protection', () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it('does not request nurse audit records until the authenticator is verified', async () => {
    let statusChecks = 0;
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path === '/mail/totp/status') {
        statusChecks += 1;
        return (statusChecks === 1 ? { enabled: true, verified: false } : { enabled: true, verified: true }) as never;
      }
      if (path === '/mail/totp/verify') return { verified: true } as never;
      if (path === '/field/audit') return { items: [{ id: 'evt-1', at: '2026-11-06T10:00:00Z', action: 'nurse.visit.check_in', item_type: 'visit' }] } as never;
      throw new Error(`Unexpected endpoint: ${path}`);
    });

    render(<AuditScreen />);
    const code = await screen.findByLabelText('Authenticator code');
    expect(vi.mocked(apiRequest).mock.calls.some(([path]) => path === '/field/audit')).toBe(false);
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and unlock' }));

    expect(await screen.findByText('nurse visit check in')).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(apiRequest).mock.calls.some(([path]) => path === '/field/audit')).toBe(true));
  });

  it('starts authenticator enrollment when the nurse has not enrolled TOTP', async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path === '/mail/totp/status') return { enabled: false, verified: false } as never;
      if (path === '/mail/totp/enroll') return { secret: 'ABCD2345', otpauth_uri: 'otpauth://totp/Nest?secret=ABCD2345' } as never;
      throw new Error(`Unexpected endpoint: ${path}`);
    });
    render(<AuditScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Set up authenticator' }));
    expect(await screen.findByText('ABCD2345')).toBeInTheDocument();
    expect(vi.mocked(apiRequest).mock.calls.some(([path]) => path === '/field/audit')).toBe(false);
  });
});
