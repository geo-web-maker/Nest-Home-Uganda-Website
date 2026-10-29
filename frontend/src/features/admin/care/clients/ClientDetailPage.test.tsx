import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../../lib/api/client';
import { ClientDetailPage } from './ClientDetailPage';

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ user: { scopes: ['clients:read', 'clients:write', 'places:read', 'places:write', 'carecfg:read'], is_superadmin: false } }),
}));
vi.mock('../../../../lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/api/client')>();
  return { ...actual, apiClient: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } };
});

function setup() {
  return render(<MemoryRouter initialEntries={['/admin/care/clients/client-000001']}>
    <Routes><Route path="/admin/care/clients/:id" element={<ClientDetailPage />} /></Routes>
  </MemoryRouter>);
}

const client = { id: 'client-000001', display_name: 'Amina N.', notes_for_nurse: 'Call on arrival', photo_allowed: true, photo_required: 'departure', photo_guidance_text: 'Avoid faces of visitors.' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockImplementation(async (path) => {
    if (path === '/admin/care/clients/client-000001') return client as never;
    if (path.endsWith('/places')) return { items: [{ id: 'place-000001', label: 'Home', address_text: 'Kampala', lat: 0.31, lng: 32.58, radius_m: 150 }] } as never;
    if (path.endsWith('/stays')) return { items: [{ id: 'stay-000001', place_id: 'place-000001', starts_on: '2026-10-01', ends_on: null }] } as never;
    if (path === '/admin/care/settings') return { items: [{ id: 'care.map_tile_url', value: '' }] } as never;
    return { items: [] } as never;
  });
  vi.mocked(apiClient.patch).mockResolvedValue({} as never);
  vi.mocked(apiClient.post).mockResolvedValue({} as never);
});

describe('ClientDetailPage', () => {
  it('loads client notes, photo policy, place details and preserved stay history', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'Amina N.' })).toBeInTheDocument();
    expect(screen.getByLabelText('Notes for nurse')).toHaveValue('Call on arrival');
    expect(screen.getByLabelText('Required photo evidence')).toHaveValue('departure');
    expect(screen.getByText('Avoid faces of visitors.')).toBeInTheDocument();
    expect(await screen.findByText('Kampala')).toBeInTheDocument();
    expect(screen.getByText(/2026-10-01/)).toBeInTheDocument();
  });

  it('saves photo/notes policy to the client endpoint rather than a local-only setting', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('heading', { name: 'Amina N.' });
    await user.clear(screen.getByLabelText('Notes for nurse'));
    await user.type(screen.getByLabelText('Notes for nurse'), 'Ring the bell');
    await user.click(screen.getByRole('button', { name: 'Save client details' }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/admin/care/clients/client-000001', expect.objectContaining({ notes_for_nurse: 'Ring the bell', photo_required: 'departure' })));
  });
});
