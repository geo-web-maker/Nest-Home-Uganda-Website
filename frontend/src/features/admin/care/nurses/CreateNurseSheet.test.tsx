import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../../lib/api/client';
import { CreateNurseSheet } from './CreateNurseSheet';

vi.mock('../../../../lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/api/client')>();
  return { ...actual, apiClient: { get: vi.fn(), post: vi.fn() } };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.post).mockResolvedValue({} as never);
  vi.mocked(apiClient.get).mockResolvedValue([{ id: 'supervisor-0001', name: 'Sam Supervisor', email: 'sam@example.com', is_superadmin: false }] as never);
});

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^Full name/), 'Grace Nurse');
  await user.type(screen.getByLabelText(/^Email address/), 'grace@example.com');
  await user.type(screen.getByLabelText(/^Phone number/), '0772000111');
  await user.type(screen.getByLabelText(/^Staff number/), 'N-014');
  await user.type(screen.getByLabelText(/^Password/), 'a-long-test-password');
}

describe('CreateNurseSheet', () => {
  it('posts the details with the password and leaves the supervisor out when none is chosen', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<CreateNurseSheet onClose={vi.fn()} onCreated={onCreated} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create nurse' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(apiClient.post).toHaveBeenCalledWith('/admin/care/nurses/direct', {
      name: 'Grace Nurse', email: 'grace@example.com', phone: '0772000111',
      staff_number: 'N-014', password: 'a-long-test-password',
    });
  });

  it('sends the chosen supervisor and can reveal the password', async () => {
    const user = userEvent.setup();
    render(<CreateNurseSheet onClose={vi.fn()} onCreated={vi.fn()} />);
    await fill(user);
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute('type', 'password');
    await user.click(screen.getByLabelText('Show password'));
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute('type', 'text');
    await screen.findByRole('option', { name: /Sam Supervisor/ });
    await user.selectOptions(screen.getByLabelText(/^Supervisor/), 'supervisor-0001');
    await user.click(screen.getByRole('button', { name: 'Create nurse' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/admin/care/nurses/direct', expect.objectContaining({ supervisor_id: 'supervisor-0001' })));
  });

  it('shows the server error and does not close', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    vi.mocked(apiClient.post).mockRejectedValue(new Error('A user with this email already exists.'));
    render(<CreateNurseSheet onClose={vi.fn()} onCreated={onCreated} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create nurse' }));
    expect(await screen.findByText('A user with this email already exists.')).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
