import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../../lib/api/client';
import { InviteNurseSheet } from './InviteNurseSheet';

vi.mock('../../../../lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/api/client')>();
  return { ...actual, apiClient: { get: vi.fn(), post: vi.fn() } };
});

beforeEach(() => { vi.clearAllMocks(); vi.mocked(apiClient.post).mockResolvedValue({} as never); vi.mocked(apiClient.get).mockResolvedValue([{ id: 'supervisor-0001', name: 'Sam Supervisor', email: 'sam@example.test', is_superadmin: false }, { id: 'admin-0001', name: 'Root Admin', email: 'root@example.test', is_superadmin: true }] as never); });

describe('InviteNurseSheet', () => {
  it('requires the supervisor and sends it with the invite request', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<InviteNurseSheet onClose={vi.fn()} onCreated={onCreated} />);
    expect(screen.getByLabelText(/^Supervisor/)).toBeRequired();
    await user.type(screen.getByLabelText(/^Full name/), 'Grace Nurse');
    await user.type(screen.getByLabelText(/^Email address/), 'grace@example.test');
    await user.type(screen.getByLabelText(/^Phone number/), '+256700000000');
    await user.type(screen.getByLabelText(/^Staff number/), 'N-014');
    await screen.findByRole('option', { name: /Sam Supervisor/ });
    await user.selectOptions(screen.getByLabelText(/^Supervisor/), 'supervisor-0001');
    await user.click(screen.getByRole('button', { name: 'Create invitation' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/admin/care/nurses', {
      name: 'Grace Nurse', email: 'grace@example.test', phone: '+256700000000', staff_number: 'N-014', supervisor_id: 'supervisor-0001',
    }));
    expect(onCreated).toHaveBeenCalledOnce();
  });

  it('lets the person retry and type a supervisor ID when the list cannot be loaded', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('down'));
    render(<InviteNurseSheet onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(await screen.findByText(/list of supervisors could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Supervisor user ID/)).toBeRequired();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('option', { name: /Sam Supervisor/ });
    expect(screen.queryByText(/could not be loaded/i)).not.toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it('sends a typed supervisor ID when the list is unavailable', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.get).mockRejectedValue(new Error('down'));
    render(<InviteNurseSheet onClose={vi.fn()} onCreated={vi.fn()} />);
    await user.type(await screen.findByLabelText(/^Supervisor user ID/), 'abc123');
    await user.type(screen.getByLabelText(/^Full name/), 'Grace Nurse');
    await user.type(screen.getByLabelText(/^Email address/), 'grace@example.test');
    await user.type(screen.getByLabelText(/^Phone number/), '+256700000000');
    await user.type(screen.getByLabelText(/^Staff number/), 'N-014');
    await user.click(screen.getByRole('button', { name: 'Create invitation' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/admin/care/nurses', expect.objectContaining({ supervisor_id: 'abc123' })));
  });
});
