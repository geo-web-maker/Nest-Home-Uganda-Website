import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './AdminLayout';
import { useAuth } from './auth/useAuth';

vi.mock('./auth/useAuth', () => ({ useAuth: vi.fn() }));

const logout = vi.fn();

function setup(path: string, scopes: string[], opts: { superadmin?: boolean; name?: string } = {}) {
  vi.mocked(useAuth).mockReturnValue({
    status: 'signedIn',
    user: {
      id: '1',
      name: opts.name ?? 'Ada Nsubuga',
      email: 'a@x.test',
      scopes,
      is_superadmin: !!opts.superadmin,
    },
    login: vi.fn(),
    logout,
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<p>dashboard page</p>} />
          <Route path="/admin/enquiries" element={<p>enquiries page</p>} />
          <Route path="/admin/enquiries/:id" element={<p>enquiry detail page</p>} />
          <Route path="/admin/users" element={<p>users page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const sidebar = () => screen.getByRole('navigation', { name: 'Admin' });
const bottom = () => screen.getByRole('navigation', { name: 'Admin shortcuts' });

beforeEach(() => {
  logout.mockReset();
  window.scrollTo = vi.fn();
});

describe('AdminLayout navigation', () => {
  it('shows only reachable items, in Work and Manage groups', () => {
    setup('/admin/enquiries', ['enquiries:read', 'reports:read']);
    const links = within(sidebar()).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['Enquiries', 'Reports']);
    expect(within(sidebar()).getByText('Work')).toBeInTheDocument();
    expect(within(sidebar()).getByText('Manage')).toBeInTheDocument();
    expect(within(sidebar()).queryByText('Careers')).not.toBeInTheDocument();
  });

  it('leaves out a group with no reachable items', () => {
    setup('/admin/enquiries', ['enquiries:read']);
    expect(within(sidebar()).getByText('Work')).toBeInTheDocument();
    expect(within(sidebar()).queryByText('Manage')).not.toBeInTheDocument();
  });

  it('marks the current item, including on a detail route', () => {
    setup('/admin/enquiries/42', ['dashboard:view', 'enquiries:read']);
    expect(within(sidebar()).getByRole('link', { name: 'Enquiries' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(sidebar()).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getByText('enquiry detail page')).toBeInTheDocument();
  });
});

describe('AdminLayout top bar', () => {
  it('shows the page title and the user initial, with no role label for a scoped user', () => {
    setup('/admin/enquiries', ['enquiries:read']);
    const header = screen.getByRole('banner');
    expect(within(header).getByText('Enquiries')).toBeInTheDocument();
    expect(within(header).getByText('Ada Nsubuga')).toBeInTheDocument();
    expect(within(header).getByText('A')).toBeInTheDocument();
    expect(within(header).queryByText('Superadmin')).not.toBeInTheDocument();
  });

  it('labels a superadmin', () => {
    setup('/admin', [], { superadmin: true });
    expect(within(screen.getByRole('banner')).getByText('Superadmin')).toBeInTheDocument();
  });
});

describe('AdminLayout phone navigation', () => {
  it('puts the first four items in the bottom nav and the rest under More, with Sign out', async () => {
    const user = userEvent.setup();
    setup('/admin', [], { superadmin: true });
    expect(
      within(bottom())
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Dashboard', 'Enquiries', 'Careers', 'Applications']);

    const more = within(bottom()).getByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');

    const list = document.getElementById('admin-more') as HTMLElement;
    expect(
      within(list)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Content', 'Site settings', 'Users and scopes', 'Reports', 'Activity log']);
    await user.click(within(list).getByRole('button', { name: 'Sign out' }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(document.getElementById('admin-more')).toBeNull();
  });

  it('closes the More list on Escape and returns focus to the button', async () => {
    const user = userEvent.setup();
    setup('/admin', [], { superadmin: true });
    const more = within(bottom()).getByRole('button', { name: 'More' });
    await user.click(more);
    await user.keyboard('{Escape}');
    expect(document.getElementById('admin-more')).toBeNull();
    expect(more).toHaveFocus();
  });

  it('closes the More list when a link is followed', async () => {
    const user = userEvent.setup();
    setup('/admin', [], { superadmin: true });
    await user.click(within(bottom()).getByRole('button', { name: 'More' }));
    await user.click(
      within(document.getElementById('admin-more') as HTMLElement).getByRole('link', {
        name: 'Users and scopes',
      }),
    );
    expect(screen.getByText('users page')).toBeInTheDocument();
    expect(document.getElementById('admin-more')).toBeNull();
  });
});

describe('AdminLayout sign out', () => {
  it('signs out from the sidebar', async () => {
    const user = userEvent.setup();
    setup('/admin', ['dashboard:view']);
    await user.click(
      within(sidebar().parentElement as HTMLElement).getByRole('button', { name: 'Sign out' }),
    );
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
