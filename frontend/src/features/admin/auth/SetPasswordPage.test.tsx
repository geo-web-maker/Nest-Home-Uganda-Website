import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiError, apiClient } from '../../../lib/api/client';
import { SetPasswordPage } from './SetPasswordPage';

const TOKEN = 't'.repeat(24);
const GOOD = 'a-long-password-1';

function setup(url = `/admin/set-password?token=${TOKEN}`) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <SetPasswordPage />
    </MemoryRouter>,
  );
}

async function fill(password: string, confirm: string) {
  await userEvent.type(screen.getByLabelText(/New password/), password);
  await userEvent.type(screen.getByLabelText(/Confirm password/), confirm);
  await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
}

describe('SetPasswordPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows an error and no form when the link has no token', () => {
    setup('/admin/set-password');
    expect(screen.getByRole('alert')).toHaveTextContent('This link is not valid');
    expect(screen.queryByLabelText(/New password/)).not.toBeInTheDocument();
  });

  it('rejects a short password without calling the API', async () => {
    const post = vi.spyOn(apiClient, 'post');
    setup();
    await fill('short', 'short');
    expect(await screen.findByText('Use at least 12 characters.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords', async () => {
    const post = vi.spyOn(apiClient, 'post');
    setup();
    await fill(GOOD, `${GOOD}x`);
    expect(await screen.findByText('The two passwords do not match.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('posts the token and password, then offers sign in', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ status: 'password_set' });
    setup();
    await fill(GOOD, GOOD);
    expect(post).toHaveBeenCalledWith(
      '/auth/set-password',
      { token: TOKEN, password: GOOD },
      { retryOn401: false },
    );
  it('redeems invite links through the purpose-specific endpoint', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ status: 'password_set' });
    setup(`/admin/set-password?token=${TOKEN}&purpose=invite`);
    await fill(GOOD, GOOD);
    expect(post).toHaveBeenCalledWith(
      '/auth/accept-invite',
      { token: TOKEN, password: GOOD },
      { retryOn401: false },
    );
  });

    expect(await screen.findByRole('status')).toHaveTextContent('Your password is set');
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute(
      'href',
      '/admin/login',
    );
  });

  it('explains an expired or used link', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(
      new ApiError(422, 'validation_failed', 'This link has expired or was already used.', {
        token: 'invalid',
      }),
    );
    setup();
    await fill(GOOD, GOOD);
    expect(await screen.findByRole('alert')).toHaveTextContent('expired or was already used');
  });
});
