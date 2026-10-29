import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../../lib/api/client';
import { InviteNurseSheet } from './InviteNurseSheet';

vi.mock('../../../../lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/api/client')>();
  return { ...actual, apiClient: { get: vi.fn(), post: vi.fn() } };
});

beforeEach(() => { vi.clearAllMocks(); vi.mocked(apiClient.post).mockResolvedValue({} as never); });

describe('InviteNurseSheet', () => {
  it('requires the supervisor and sends it with the invite request', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<InviteNurseSheet onClose={vi.fn()} onCreated={onCreated} />);
    expect(screen.getByLabelText(/^Supervisor user ID/)).toBeRequired();
    await user.type(screen.getByLabelText(/^Full name/), 'Grace Nurse');
    await user.type(screen.getByLabelText(/^Email address/), 'grace@example.test');
    await user.type(screen.getByLabelText(/^Phone number/), '+256700000000');
    await user.type(screen.getByLabelText(/^Staff number/), 'N-014');
    await user.type(screen.getByLabelText(/^Supervisor user ID/), 'supervisor-0001');
    await user.click(screen.getByRole('button', { name: 'Create invitation' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/admin/care/nurses', {
      name: 'Grace Nurse', email: 'grace@example.test', phone: '+256700000000', staff_number: 'N-014', supervisor_id: 'supervisor-0001',
    }));
    expect(onCreated).toHaveBeenCalledOnce();
  });
});
