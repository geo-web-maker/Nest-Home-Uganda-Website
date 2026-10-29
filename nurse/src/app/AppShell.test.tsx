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
});
