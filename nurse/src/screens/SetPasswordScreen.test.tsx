import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SetPasswordScreen } from './SetPasswordScreen';

const show = (search: string) => render(<MemoryRouter initialEntries={[`/set-password${search}`]}><SetPasswordScreen /></MemoryRouter>);
const fill = (a: string, b: string) => {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: a } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: b } });
  fireEvent.click(screen.getByRole('button', { name: 'Save password' }));
};

afterEach(() => vi.unstubAllGlobals());

describe('nurse set-password screen', () => {
  it('rejects a link with no token', () => {
    show('');
    expect(screen.getByRole('alert').textContent).toMatch(/not valid/);
  });

  it('checks length and matching before calling the API', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    show('?token=t&purpose=invite');
    fill('short', 'short');
    expect(screen.getByRole('alert').textContent).toMatch(/at least 12/);
    fill('a-long-enough-pass', 'a-different-pass');
    expect(screen.getByRole('alert').textContent).toMatch(/do not match/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redeems an invite token and offers sign-in', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    show('?token=abc&purpose=invite');
    fill('a-long-enough-pass', 'a-long-enough-pass');
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/password is set/));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/auth\/accept-invite$/);
    expect(JSON.parse(String(init.body))).toEqual({ token: 'abc', password: 'a-long-enough-pass' });
  });

  it('uses the reset endpoint for a reset link and explains an expired link', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'x' }), { status: 422, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    show('?token=abc&purpose=reset');
    fill('a-long-enough-pass', 'a-long-enough-pass');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/expired/));
    expect((fetchMock.mock.calls[0] as [string])[0]).toMatch(/\/auth\/set-password$/);
  });
});
