import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api/client';
import { SettingsPage } from './SettingsPage';
const authMock = vi.hoisted(() => ({ scopes: ['settings:read', 'settings:write'] as string[] }));
vi.mock('../../../lib/api/client', () => ({
  apiClient: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}));
vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'u',
      name: 'Admin',
      email: 'admin@example.invalid',
      scopes: authMock.scopes,
      is_superadmin: false,
    },
  }),
}));
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('SettingsPage', () => {
  beforeEach(() => {
    authMock.scopes = ['settings:read', 'settings:write'];
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.patch).mockReset();
    vi.mocked(apiClient.post).mockReset();
  });

  it('shows the settings tabs', () => {
    setup();
    expect(screen.getByRole('tab', { name: 'Business details' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'SMS' })).not.toBeInTheDocument();
  });
  it('renders settings values from the API', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce([
      { key: 'business.phone_display', group: 'business', value: '0787 499 988' },
    ]);
    setup();
    expect(await screen.findByDisplayValue('0787 499 988')).toBeInTheDocument();
  });
  it('reports a load error', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('offline'));
    setup();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
  it('does not show the SMS tab without system:manage', () => {
    setup();
    expect(screen.queryByRole('tab', { name: 'SMS' })).not.toBeInTheDocument();
  });

  it('allows a system manager to open and edit only SMS settings', async () => {
    authMock.scopes = ['system:manage'];
    vi.mocked(apiClient.get).mockResolvedValueOnce([
      { key: 'sms.staff_enabled', group: 'sms', value: true },
    ]);
    setup();
    expect(await screen.findByRole('tab', { name: 'SMS' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByRole('tab', { name: 'Business details' })).not.toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/admin/settings/sms');
    expect(await screen.findByRole('checkbox')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeEnabled();
  });
});
