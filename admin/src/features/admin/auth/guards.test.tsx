import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ApiError, apiClient } from '@shared/lib/api/client';
import { createQueryClient } from '@shared/lib/queries/queryClient';
import { scopesFor } from '../nav';
import { RequireAuth, RequireScopes } from './guards';
import { useAuth } from './useAuth';

vi.mock('./useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@shared/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/lib/api/client')>();
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn() } };
});

const entry = (allowed: boolean) => ({ allowed, url: null, android_package: '', apk_available: false });
const appAccess = (adminAllowed: boolean) => ({ admin: entry(adminAllowed), nurse: entry(false), handoff_enabled: false });

/** The shell asks the server for app access before it renders; every other request fails quietly. */
function serveAppAccess(result: () => Promise<unknown>) {
  vi.mocked(apiClient.get).mockImplementation(((path: string) =>
    path === '/auth/app-access' ? result() : Promise.reject(new Error('offline'))) as never);
}

beforeEach(() => serveAppAccess(async () => appAccess(true)));

function LoginProbe() {
  const state = useLocation().state as { from?: string } | null;
  return <p>login, from {state?.from}</p>;
}

function setup(
  path: string,
  auth: { status: 'loading' | 'signedIn' | 'signedOut'; scopes?: string[]; superadmin?: boolean; missingUser?: boolean },
) {
  const user =
    auth.status === 'signedIn' && !auth.missingUser
      ? {
          id: '1',
          name: 'Ada',
          email: 'a@x.test',
          scopes: auth.scopes ?? [],
          is_superadmin: !!auth.superadmin,
        }
      : null;
  vi.mocked(useAuth).mockReturnValue({
    status: auth.status,
    user,
    login: vi.fn(),
    logout: vi.fn(),
  });
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginProbe />} />
          <Route element={<RequireAuth />}>
            <Route index element={<RequireScopes scopes={scopesFor('/')}><p>dashboard</p></RequireScopes>} />
            <Route element={<RequireScopes scopes={scopesFor('/enquiries')} />}>
              <Route path="/enquiries" element={<p>enquiries</p>} />
              <Route path="/enquiries/:id" element={<p>enquiry detail</p>} />
            </Route>
            <Route element={<RequireScopes scopes={scopesFor('/users')} />}>
              <Route path="/users" element={<p>users</p>} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('route guards', () => {
  it('sends a signed-out visitor to login and remembers the page', () => {
    setup('/enquiries?status=new', { status: 'signedOut' });
    expect(screen.getByText('login, from /enquiries?status=new')).toBeInTheDocument();
  });

  it('shows a loading message while the session is being restored', () => {
    setup('', { status: 'loading' });
    expect(screen.getByRole('status')).toHaveTextContent('Opening your workspace');
  });

  it('shows the plain no-access page with the business phone when no screen is reachable', async () => {
    setup('/', { status: 'signedIn', missingUser: true });
    expect(
      await screen.findByRole('heading', { name: 'No access has been granted to this account' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '0787 499 988' })).toHaveAttribute(
      'href',
      'tel:+256787499988',
    );
    expect(screen.queryByText('dashboard')).toBeNull();
  });

  it('lets a user with the scope reach the list and its detail route', async () => {
    setup('/enquiries/abc', { status: 'signedIn', scopes: ['enquiries:read'] });
    expect(await screen.findByText('enquiry detail')).toBeInTheDocument();
  });

  it('blocks a route without the scope and sends the user to their first reachable screen', async () => {
    setup('/users', { status: 'signedIn', scopes: ['enquiries:read'] });
    expect(await screen.findByText('enquiries')).toBeInTheDocument();
    expect(screen.queryByText('users')).toBeNull();
    expect(screen.getByText('enquiries')).toBeInTheDocument();
  });

  it('lets a superadmin reach every guarded route', async () => {
    setup('/users', { status: 'signedIn', superadmin: true });
    expect(await screen.findByText('users')).toBeInTheDocument();
  });

  it('shows no access when the server says this account is not allowed in the admin app', async () => {
    serveAppAccess(async () => appAccess(false));
    setup('/enquiries', { status: 'signedIn', scopes: ['enquiries:read'] });
    expect(await screen.findByRole('heading', { name: 'No access has been granted to this account' })).toBeInTheDocument();
    expect(screen.queryByText('enquiries')).toBeNull();
  });

  it('falls back to the account scopes when an older backend has no app-access route', async () => {
    serveAppAccess(() => Promise.reject(new ApiError(404, 'not_found', 'Not found')));
    setup('/enquiries', { status: 'signedIn', scopes: ['enquiries:read'] });
    expect(await screen.findByText('enquiries')).toBeInTheDocument();
  });
});
