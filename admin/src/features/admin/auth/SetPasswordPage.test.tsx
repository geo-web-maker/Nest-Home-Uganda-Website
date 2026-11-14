import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ApiError, apiClient } from '@shared/lib/api/client';
import { SetPasswordPage } from './SetPasswordPage';

const TOKEN = 't'.repeat(24);
const GOOD = 'a-long-password-1';

function setup(url = `/set-password?token=${TOKEN}`) {
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
    setup('/set-password');
    expect(screen.getByRole('alert')).toHaveTextContent('This link is not valid');
    expect(screen.queryByLabelText(/New password/)).not.toBeInTheDocument();
  });

  it('rejects a short password without calling the API', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ status: 'ok' });
    setup();
    await fill('short', 'short');
    expect(await screen.findByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalledWith('/auth/set-password', expect.anything(), expect.anything());
  });

  it('rejects mismatched passwords', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ status: 'ok' });
    setup();
    await fill(GOOD, `${GOOD}x`);
    expect(await screen.findByText('The two passwords do not match.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalledWith('/auth/set-password', expect.anything(), expect.anything());
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
    expect(await screen.findByRole('status')).toHaveTextContent('Your password is set');
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('redeems invite links through the purpose-specific endpoint', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ status: 'password_set' });
    setup(`/set-password?token=${TOKEN}&purpose=invite`);
    await fill(GOOD, GOOD);
    expect(post).toHaveBeenCalledWith(
      '/auth/accept-invite',
      { token: TOKEN, password: GOOD },
      { retryOn401: false },
    );
  });

  it('explains a used link before a password is typed, and offers sign in', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(
      new ApiError(422, 'validation_error', 'This link was already used.', {
        token: 'invalid', state: 'used', ref: 'S3-ABC123',
      }),
    );
    setup();
    expect(await screen.findByRole('heading', { name: 'This link was already used' })).toBeInTheDocument();
    expect(screen.getByText(/Reference: S3-ABC123/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByLabelText(/New password/)).not.toBeInTheDocument();
  });

  it('explains an incomplete link without calling the server', () => {
    const post = vi.spyOn(apiClient, 'post');
    setup('/set-password?token=abc');
    expect(screen.getByRole('heading', { name: 'This link is incomplete' })).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('keeps the form and says the link is fine when the network fails on save', async () => {
    vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) => {
      if (url === '/auth/set-password/check') return { status: 'ok' };
      throw new ApiError(0, 'network_error', 'Network error');
    });
    setup();
    await fill(GOOD, GOOD);
    expect(await screen.findByRole('alert')).toHaveTextContent('Your link is fine');
    expect(screen.getByLabelText(/New password/)).toBeInTheDocument();
  });
});
