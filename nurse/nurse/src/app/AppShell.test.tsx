import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

function renderShell(path: string, online: boolean) {
  return render(<MemoryRouter initialEntries={[path]}><AppShell online={online} queued={3} authenticated message="Saved locally" sosEnabled={false} smsHref="sms:?body=help" onSendSos={vi.fn(async () => undefined)}><h2>Test page</h2></AppShell></MemoryRouter>);
}

describe('nurse app shell', () => {
  it('shows the offline state and a sync-status link', () => {
    renderShell('/', false);
    expect(screen.getByText('Offline')).toBeTruthy();
    expect(screen.getByRole('link', { name: /3 waiting/i })).toBeTruthy();
    expect(screen.getByText('Saved locally')).toBeTruthy();
    expect(screen.getByText('Offline')).toBeTruthy();
  });

  it('renders the compact connection status and marks the current tab predictably', () => {
    renderShell('/timesheets', true);
    // The shell renders two "Main navigation" landmarks (desktop rail and bottom tabs); CSS shows
    // one at a time, but jsdom applies no CSS, so both exist here and each must agree.
    const links = (name: string) => screen.getAllByRole('link', { name });
    expect(links('History')).toHaveLength(2);
    for (const link of links('History')) expect(link.getAttribute('aria-current')).not.toBe('page');
    for (const link of links('Timesheets')) expect(link.getAttribute('aria-current')).toBe('page');
    for (const link of links('Today')) expect(link.getAttribute('aria-current')).not.toBe('page');
    expect(links('Profile')).toHaveLength(2);
    expect(links('Timesheets')).toHaveLength(2);
  });

  const renderGuest = (online: boolean) => render(<MemoryRouter initialEntries={['/']}><AppShell online={online} queued={0} authenticated={false} sosEnabled={false} smsHref="sms:?body=help" onSendSos={vi.fn(async () => undefined)}><h2>Sign in</h2></AppShell></MemoryRouter>);

  it('reserves no side-rail space and hides the status banner on the sign-in screen while online', () => {
    const { container } = renderGuest(true);
    expect(container.querySelector('.nurse-app')).toHaveClass('nurse-app--guest');
    expect(container.querySelector('.desktop-rail')).toBeNull();
    expect(container.querySelector('.connection-banner')).toBeNull();
  });

  it('still tells a signed-out person when the device is offline', () => {
    const { container } = renderGuest(false);
    expect(container.querySelector('.connection-banner')).not.toBeNull();
  });


  it('renders no signed-in connection banner while online with an empty queue and no message', () => {
    const { container } = render(<MemoryRouter><AppShell online queued={0} authenticated message="" sosEnabled={false} smsHref="sms:?body=help" onSendSos={vi.fn(async () => undefined)}><h2>Today</h2></AppShell></MemoryRouter>);
    expect(container.querySelector('.connection-banner')).toBeNull();
  });

  it('keeps the side rail space for signed-in nurses', () => {
    const { container } = renderShell('/', true);
    expect(container.querySelector('.nurse-app')).not.toHaveClass('nurse-app--guest');
  });

  it('keeps one accessible navigation contract across both rail and phone tabs and omits the old masthead', () => {
    const { container } = renderShell('/', true);
    const navs = container.querySelectorAll('nav[aria-label=\"Main navigation\"]');
    expect(navs).toHaveLength(2);
    const states = [...navs].map((nav) => [...nav.querySelectorAll('a')].map((link) => [link.textContent?.trim(), link.getAttribute('aria-current')]));
    expect(states[0]).toEqual(states[1]);
    expect(container.querySelector('.app-header')).toBeNull();
  });
});
