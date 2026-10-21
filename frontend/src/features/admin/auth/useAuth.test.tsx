import { render, screen } from '@testing-library/react';
import { authStore } from './authStore';
import { AuthProvider, useAuth } from './useAuth';

const USER = { id: 'u1', name: 'Ada', email: 'a@x.test', scopes: [], is_superadmin: false };
const SESSION = {
  access_token: 'a1',
  token_type: 'bearer',
  expires_in: 900,
  csrf_token: 'c2',
  user: USER,
};

function Probe() {
  const { status, user } = useAuth();
  return <p>{user ? `${status}:${user.name}` : status}</p>;
}

function setup() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

describe('AuthProvider', () => {
  beforeEach(() => authStore.reset());
  afterEach(() => vi.unstubAllGlobals());

  it('restores the session from the refresh cookie when a CSRF token is stored', async () => {
    window.localStorage.setItem('nhc.csrf', 'c1');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(SESSION), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    setup();

    expect(await screen.findByText('signedIn:Ada')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ 'X-CSRF-Token': 'c1' });
  });

  it('goes to signed out, without a request, when nothing is stored', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    setup();

    expect(await screen.findByText('signedOut')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('goes back to signed out when the refresh is refused', async () => {
    window.localStorage.setItem('nhc.csrf', 'c1');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 401 })),
    );
    setup();

    expect(await screen.findByText('signedOut')).toBeInTheDocument();
    expect(authStore.getCsrf()).toBeNull();
  });

  it('useAuth throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useAuth must be used inside AuthProvider');
  });
});
