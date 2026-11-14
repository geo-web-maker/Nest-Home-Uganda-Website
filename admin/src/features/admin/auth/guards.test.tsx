import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { createQueryClient } from '@shared/lib/queries/queryClient';
import { scopesFor } from '../nav';
import { RequireAuth, RequireScopes } from './guards';
import { useAuth } from './useAuth';

vi.mock('./useAuth', () => ({ useAuth: vi.fn() }));

function LoginProbe() {
  const state = useLocation().state as { from?: string } | null;
  return <p>login, from {state?.from}</p>;
}

function setup(
  path: string,
  auth: { status: 'loading' | 'signedIn' | 'signedOut'; scopes?: string[]; superadmin?: boolean },
) {
  const user =
    auth.status === 'signedIn'
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
            <Route path="" element={<p>dashboard</p>} />
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
    expect(screen.getByText('login, from /admin/enquiries?status=new')).toBeInTheDocument();
  });

  it('renders nothing while the session is being restored', () => {
    const { container } = setup('', { status: 'loading' });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the plain no-access page with the business phone when no screen is reachable', () => {
    setup('', { status: 'signedIn', scopes: ['enquiries:write'] });
    expect(
      screen.getByRole('heading', { name: 'No access has been granted to this account' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '0787 499 988' })).toHaveAttribute(
      'href',
      'tel:+256787499988',
    );
    expect(screen.queryByText('dashboard')).toBeNull();
  });

  it('lets a user with the scope reach the list and its detail route', () => {
    setup('/enquiries/abc', { status: 'signedIn', scopes: ['enquiries:read'] });
    expect(screen.getByText('enquiry detail')).toBeInTheDocument();
  });

  it('blocks a route without the scope and sends the user to their first reachable screen', () => {
    setup('/users', { status: 'signedIn', scopes: ['enquiries:read'] });
    expect(screen.queryByText('users')).toBeNull();
    expect(screen.getByText('enquiries')).toBeInTheDocument();
  });

  it('lets a superadmin reach every guarded route', () => {
    setup('/users', { status: 'signedIn', superadmin: true });
    expect(screen.getByText('users')).toBeInTheDocument();
  });
});
