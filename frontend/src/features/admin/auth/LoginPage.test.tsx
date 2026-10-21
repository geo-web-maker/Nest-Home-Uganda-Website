import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiError } from '../../../lib/api/client';
import { LoginPage } from './LoginPage';
import { useAuth } from './useAuth';

vi.mock('./useAuth', () => ({ useAuth: vi.fn() }));

const login = vi.fn();

function setup(
  status: 'loading' | 'signedIn' | 'signedOut' = 'signedOut',
  from?: string,
  loginFn: typeof login = login,
  user: {
    id: string;
    name: string;
    email: string;
    scopes: string[];
    is_superadmin: boolean;
  } | null = null,
) {
  vi.mocked(useAuth).mockReturnValue({ status, user, login: loginFn, logout: vi.fn() });
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/admin/login', state: from ? { from } : null }]}>
      <Routes>
        <Route path="/admin/login" element={<LoginPage />} />
        <Route path="/admin" element={<p>admin home</p>} />
        <Route path="/admin/careers" element={<p>careers screen</p>} />
        <Route path="/admin/enquiries" element={<p>enquiries screen</p>} />
        <Route path="*" element={<p>elsewhere</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fill(email: string, password: string) {
  await userEvent.type(screen.getByLabelText(/Email/), email);
  await userEvent.type(screen.getByLabelText(/Password/), password);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginPage', () => {
  beforeEach(() => login.mockReset());

  it('has an h1, two required labelled fields and a submit button', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email (required)')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password (required)')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('shows both field errors and does not call the API when the form is empty', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('signs in with the trimmed email and the password as typed', async () => {
    login.mockResolvedValue(undefined);
    setup();
    await fill('  ada@example.test ', ' pw ');
    expect(login).toHaveBeenCalledWith('ada@example.test', ' pw ');
  });

  it.each([
    [401, 'unauthorised', 'Incorrect email or password.', 'Incorrect email or password.'],
    [429, 'rate_limited', 'x', 'Too many attempts. Please try again later.'],
    [
      403,
      'forbidden',
      'Two-step sign-in is not available yet.',
      'Two-step sign-in is not available yet.',
    ],
    [
      0,
      'network_error',
      'Network request failed',
      'We could not sign you in just now. Please try again.',
    ],
  ])(
    'shows the right message in an alert for status %i',
    async (status, code, serverMessage, shown) => {
      const failing = vi.fn().mockRejectedValue(new ApiError(status, code, serverMessage));
      setup('signedOut', undefined, failing);
      await fill('ada@example.test', 'pw');
      expect(await screen.findByRole('alert')).toHaveTextContent(shown);
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    },
  );

  it('renders nothing while the first session restore is running', () => {
    const { container } = setup('loading');
    expect(container).toBeEmptyDOMElement();
  });

  it('sends a signed-in user to /admin, or back to the admin page they came from', () => {
    setup('signedIn');
    expect(screen.getByText('admin home')).toBeInTheDocument();
  });

  it('goes back to the admin page the user came from', () => {
    setup('signedIn', '/admin/enquiries');
    expect(screen.getByText('enquiries screen')).toBeInTheDocument();
  });

  it('ignores a `from` outside the admin', () => {
    setup('signedIn', '/somewhere-else');
    expect(screen.getByText('admin home')).toBeInTheDocument();
  });

  it('lands on the first reachable screen when there is no `from`', () => {
    const user = {
      id: '1',
      name: 'A',
      email: 'a@x.test',
      scopes: ['jobs:read'],
      is_superadmin: false,
    };
    setup('signedIn', undefined, login, user);
    expect(screen.getByText('careers screen')).toBeInTheDocument();
  });
});
