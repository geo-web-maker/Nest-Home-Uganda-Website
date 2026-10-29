import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../../lib/api/client';
import { NurseDetailPage } from './NurseDetailPage';

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ user: { scopes: ['nurses:read', 'nurses:write', 'carecfg:write'], is_superadmin: false }, status: 'signedIn' }),
}));
vi.mock('../../../../lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/api/client')>();
  return { ...actual, apiClient: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } };
});

const details = {
  person: { name: 'Grace N.', email: 'grace@example.test', phone_e164: '+256700000000', is_active: true },
  profile: { user_id: 'nurse-000001', staff_number: 'N-001', supervisor_id: 'supervisor-0001', team_id: 'team-1', active: true, phone_e164: '+256700000000', last_seen_at: '2026-10-28T09:00:00Z', app_version: '1.2.0', battery_pct: 80, adhoc_override: null, consent_versions: { privacy_notice: 'v3' } },
  devices: [{ device_id: 'device-000001', platform: 'android', registered_at: '2026-10-28T08:00:00Z', revoked_at: null, push_token_updated_at: null, has_push_token: true }],
  consents: [{ type: 'privacy_notice', version: 'v3', source: 'field_app', accepted_at: '2026-10-28T08:01:00Z' }],
};

function setup() {
  return render(<MemoryRouter initialEntries={['/admin/care/nurses/nurse-000001']}>
    <Routes><Route path="/admin/care/nurses/:userId" element={<NurseDetailPage />} /></Routes>
  </MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockResolvedValue(details as never);
  vi.mocked(apiClient.patch).mockResolvedValue({} as never);
  vi.mocked(apiClient.post).mockResolvedValue({} as never);
});

describe('NurseDetailPage', () => {
  it('renders assignment, device health and consent but never a push-token secret', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'Grace N.' })).toBeInTheDocument();
    expect(screen.getAllByText(/N-001/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/token present/)).toBeInTheDocument();
    expect(screen.getByText(/privacy notice/)).toBeInTheDocument();
    expect(screen.queryByText(/push_token/i)).not.toBeInTheDocument();
  });

  it('sends supervisor assignment to the audited endpoint', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('heading', { name: 'Grace N.' });
    const field = screen.getByLabelText('Supervisor user ID');
    await user.clear(field);
    await user.type(field, 'supervisor-0002');
    await user.click(screen.getByRole('button', { name: 'Save supervisor' }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/admin/care/nurses/nurse-000001/supervisor', { supervisor_id: 'supervisor-0002' }));
  });
});
