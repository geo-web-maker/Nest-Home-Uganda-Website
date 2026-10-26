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
  });

  it('marks the current tab and keeps the shell tabs predictable', () => {
    renderShell('/history', true);
    expect(screen.getByRole('link', { name: 'History' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Today' }).getAttribute('aria-current')).not.toBe('page');
    expect(screen.getByRole('link', { name: 'Profile' })).toBeTruthy();
  });
});
