import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Button } from '@shared/components/ui/Button';
import { AdminLayout } from './AdminLayout';
import { useAuth } from './auth/useAuth';
import { useMailUnread } from './mail/useMailUnread';

vi.mock('./auth/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('./mail/useMailUnread', () => ({ useMailUnread: vi.fn(() => 0) }));

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
          <Route path="" element={<p>dashboard page</p>} />
          <Route path="/enquiries" element={<p>enquiries page</p>} />
          <Route path="/enquiries/:id" element={<p>enquiry detail page</p>} />
          <Route path="/users" element={<p>users page</p>} />
          <Route
            path="/care/sos"
            element={
              <>
                <p>sos page</p>
                <Button>Page action</Button>
              </>
            }
          />
          <Route path="/care/sos/history" element={<p>sos history page</p>} />
          <Route path="/care/sos/:id" element={<p>sos case page</p>} />
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

afterEach(() => {
  window.localStorage.removeItem('nest-theme');
  document.documentElement.removeAttribute('data-theme');
});

describe('AdminLayout navigation', () => {
  it('shows only reachable items in the reference Website group', () => {
    setup('/enquiries', ['enquiries:read', 'reports:read']);
    const links = within(sidebar()).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['Enquiries', 'Reports']);
    expect(within(sidebar()).getByText('Website')).toBeInTheDocument();
    expect(within(sidebar()).queryByText('Monitoring')).not.toBeInTheDocument();
    expect(within(sidebar()).queryByText('Careers')).not.toBeInTheDocument();
  });

  it('leaves out groups with no reachable items', () => {
    setup('/enquiries', ['enquiries:read']);
    expect(within(sidebar()).getByText('Website')).toBeInTheDocument();
    expect(within(sidebar()).queryByText('Care operations')).not.toBeInTheDocument();
  });

  it('marks the current item, including on a detail route', () => {
    setup('/enquiries/42', ['dashboard:view', 'enquiries:read']);
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

describe('AdminLayout current item', () => {
  const scopes = ['alerts:read', 'dashboard:view'];
  const current = (nav: HTMLElement) =>
    within(nav)
      .queryAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
      .map((link) => link.textContent?.trim());

  it('marks only SOS history on the history page, not SOS as well', () => {
    setup('/care/sos/history', scopes);
    expect(current(sidebar())).toEqual(['SOS history & drills']);
    expect(within(sidebar()).getByRole('link', { name: 'SOS' })).not.toHaveAttribute('aria-current');
  });

  it('marks only SOS on the SOS page', () => {
    setup('/care/sos', scopes);
    expect(current(sidebar())).toEqual(['SOS']);
  });

  it('keeps an SOS case under SOS, not under history', () => {
    setup('/care/sos/case-9', scopes);
    expect(current(sidebar())).toEqual(['SOS']);
  });

  it('marks one item at a time on the phone bottom bar too', () => {
    setup('/care/sos/history', scopes);
    expect(current(bottom()).length).toBeLessThanOrEqual(1);
    expect(current(bottom())).not.toContain('SOS');
  });

  it('gives every page button the admin control size without the page asking for it', () => {
    setup('/care/sos', scopes);
    expect(screen.getByRole('button', { name: 'Page action' })).toHaveAttribute('data-size', 'control');
  });
});

describe('AdminLayout top bar', () => {
  it('provides a labelled Light/Dark theme switch in the top bar', async () => {
    const user = userEvent.setup();
    setup('', ['dashboard:view']);
    const header = screen.getByRole('banner');
    const group = within(header).getByRole('group', { name: 'Theme' });
    const light = within(group).getByRole('button', { name: 'Light' });
    const dark = within(group).getByRole('button', { name: 'Dark' });

    expect(light).toHaveAttribute('aria-pressed', 'true');
    await user.click(dark);
    expect(dark).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('nest-theme')).toBe('dark');
  });

  it('shows the page title and the user initial, with no role label for a scoped user', () => {
    setup('/enquiries', ['enquiries:read']);
    const header = screen.getByRole('banner');
    expect(within(header).getByText('Enquiries')).toBeInTheDocument();
    expect(within(header).getByText('Ada Nsubuga')).toBeInTheDocument();
    expect(within(header).getByText('A')).toBeInTheDocument();
    expect(within(header).queryByText('Superadmin')).not.toBeInTheDocument();
  });

  it('labels a superadmin', () => {
    setup('', [], { superadmin: true });
    expect(within(screen.getByRole('banner')).getByText('Superadmin')).toBeInTheDocument();
  });
});

describe('AdminLayout phone navigation', () => {
  it('puts the reference dashboard/visits/alerts/SOS shortcuts in the bottom nav and the rest under More', async () => {
    const user = userEvent.setup();
    setup('', [], { superadmin: true });
    expect(
      within(bottom())
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Today', 'Visits', 'Alerts', 'SOS']);

    const more = within(bottom()).getByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');

    const list = document.getElementById('admin-more') as HTMLElement;
    expect(
      within(list)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual([
      'Enquiries',
      'Careers',
      'Applications',
      'Content',
      'Site settings',
      'Users and scopes',
      'Permissions',
      'Reports',
      'Audit log',
      'Mail',
      'Clients',
      'Places & stays',
      'Nurses',
      'Schedule',
      'Flags',
      'My team',
      'Agreements',
      'Live dashboard',
      'Executive charts',
      'Last-seen map',
      'Timesheets',
      'Photo review',
      'Care reports',
      'Notification log',
      'SOS history & drills',
      'On-call roster',
      'SOS procedure',
      'Care settings',
      'Setting catalogue',
      'Data and retention',
      'SMS provider & limits',
      'Go-live checklist',
      'Data requests',
      'App releases',
      'Backups and hosting',
      'Shared mailboxes',
      'Mail settings',
    ]);
    await user.click(within(list).getByRole('button', { name: 'Sign out' }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(document.getElementById('admin-more')).toBeNull();
  });

  it('groups the More sheet under the same headings as the sidebar and can be dismissed', async () => {
    const user = userEvent.setup();
    setup('', [], { superadmin: true });
    await user.click(within(bottom()).getByRole('button', { name: 'More' }));
    const sheet = document.getElementById('admin-more') as HTMLElement;
    expect(sheet).toHaveAttribute('role', 'dialog');
    expect(
      within(sheet)
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(['Website', 'Care operations', 'Monitoring', 'Safety', 'Setup']);

    await user.click(within(sheet).getByRole('button', { name: 'Close menu' }));
    expect(document.getElementById('admin-more')).toBeNull();

    await user.click(within(bottom()).getByRole('button', { name: 'More' }));
    await user.click(document.querySelector('[class*="scrim"]') as HTMLElement);
    expect(document.getElementById('admin-more')).toBeNull();
  });

  it('closes the More list on Escape and returns focus to the button', async () => {
    const user = userEvent.setup();
    setup('', [], { superadmin: true });
    const more = within(bottom()).getByRole('button', { name: 'More' });
    await user.click(more);
    await user.keyboard('{Escape}');
    expect(document.getElementById('admin-more')).toBeNull();
    expect(more).toHaveFocus();
  });

  it('closes the More list when a link is followed', async () => {
    const user = userEvent.setup();
    setup('', [], { superadmin: true });
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
    setup('', ['dashboard:view']);
    await user.click(
      within(sidebar().parentElement as HTMLElement).getByRole('button', { name: 'Sign out' }),
    );
    expect(logout).toHaveBeenCalledTimes(1);
  });
});

describe('AdminLayout mail badge', () => {
  it('shows the unread total on the Mail link and asks the hook only when the person can use mail', () => {
    vi.mocked(useMailUnread).mockReturnValue(3);
    setup('', ['mail:use']);
    const sidebar = screen.getByRole('navigation', { name: 'Admin' });
    expect(within(sidebar).getByLabelText('3 unread')).toHaveTextContent('3');
    expect(vi.mocked(useMailUnread)).toHaveBeenLastCalledWith(true);
  });

  it('caps the badge at 99+ and shows nothing at zero', () => {
    vi.mocked(useMailUnread).mockReturnValue(250);
    const { unmount } = setup('', ['mail:use']);
    expect(screen.getAllByText('99+').length).toBeGreaterThan(0);
    unmount();
    vi.mocked(useMailUnread).mockReturnValue(0);
    setup('', ['mail:use']);
    expect(screen.queryByLabelText(/unread/)).toBeNull();
  });

  it('does not ask for mail counts when the person has no mail scope', () => {
    vi.mocked(useMailUnread).mockReturnValue(0);
    setup('', ['enquiries:read']);
    expect(vi.mocked(useMailUnread)).toHaveBeenLastCalledWith(false);
  });

  it('puts the same badge on the phone bottom bar when Mail is one of its shortcuts', () => {
    vi.mocked(useMailUnread).mockReturnValue(4);
    setup('', ['mail:use']);
    const bottom = screen.getByRole('navigation', { name: /shortcuts/i });
    expect(within(bottom).queryByLabelText('4 unread')).not.toBeNull();
  });
});
