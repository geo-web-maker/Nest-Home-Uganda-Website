import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@shared/lib/api/client';
import { ProfilePage } from './ProfilePage';

const profileMocks = vi.hoisted(() => ({
  user: { id: 'staff-000001', name: 'Grace N.', email: 'grace@example.test', scopes: ['clients:read'], is_superadmin: false },
}));

vi.mock('./auth/useAuth', () => ({ useAuth: () => ({ user: profileMocks.user, status: 'signedIn' }) }));
vi.mock('@shared/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/lib/api/client')>();
  return { ...actual, apiClient: { ...actual.apiClient, get: vi.fn() } };
});

beforeEach(() => {
  vi.clearAllMocks();
  profileMocks.user.scopes = ['clients:read'];
  const entry = (allowed: boolean, url: string | null) => ({ allowed, url, android_package: '', apk_available: false });
  vi.mocked(apiClient.get).mockImplementation((async (path: string) => {
    if (path === '/auth/auto-sso') return { master_enabled: false, user_enabled: false, admin_allowed: true, effective_enabled: false };
    if (path === '/auth/app-access') {
      const nurse = profileMocks.user.scopes.includes('field:use');
      return { admin: entry(true, null), nurse: entry(nurse, nurse ? 'https://nurse.example.test' : null), handoff_enabled: false };
    }
    return { url: 'https://nurse.example.test' };
  }) as never);
});

describe('ProfilePage app switching', () => {
  it('shows the shared profile without requesting a nurse app link for a single-scope account', async () => {
    render(<MemoryRouter><ProfilePage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'My profile' })).toBeInTheDocument();
    expect(screen.getByText('Grace N.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open nurse app' })).not.toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalledWith('/admin/care/switch-app');
    expect(apiClient.get).not.toHaveBeenCalledWith('/auth/app-access');
  });

  it('offers app switching only when the current account also has field:use', async () => {
    profileMocks.user.scopes = ['clients:read', 'field:use'];
    render(<MemoryRouter><ProfilePage /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Open nurse app' })).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/admin/care/switch-app');
  });
});
