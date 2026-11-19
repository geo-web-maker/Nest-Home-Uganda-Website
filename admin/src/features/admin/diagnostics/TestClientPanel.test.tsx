import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@shared/lib/api/client';
import { TestClientPanel, type TestClientStatus } from './TestClientPanel';

vi.mock('@shared/lib/api/client', () => ({ apiClient: { post: vi.fn() } }));

const base: TestClientStatus = {
  enabled: true, present: true, day_offset: 0, world_date: '2026-11-19', today: '2026-11-19', scenario: 'standard_day',
  patient_types: ['General', 'Mama', 'Baby'], visit_states: ['scheduled', 'completed'], max_step_days: 14,
  scenarios: { standard_day: { label: 'A normal day', about: 'Yesterday done.' }, missed_visit: { label: 'A missed visit', about: 'Missed.' } },
  client: { id: 'c1', name: 'Test Client', patient_type: 'General' },
  place: { lat: 0.3476, lng: 32.5825, radius_m: 150, address: 'Kampala' },
  visits: [{ id: 'v1', start: '2026-11-19T06:00:00Z', end: '2026-11-19T07:00:00Z', status: 'scheduled', checked_in: null, checked_out: null, adhoc: false, safety: null }],
};

function setup(status: TestClientStatus = base) {
  const onChanged = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><TestClientPanel status={status} onChanged={onChanged} /></QueryClientProvider>);
  return onChanged;
}

describe('TestClientPanel', () => {
  beforeEach(() => vi.mocked(apiClient.post).mockReset().mockResolvedValue({}));

  it('switches the client on with the chosen patient type', async () => {
    const onChanged = setup({ ...base, enabled: false, present: false, client: null, place: null, visits: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Switch on' }));
    expect(apiClient.post).toHaveBeenCalledWith('/admin/test-accounts/client/enable', { patient_type: 'General' });
    await screen.findByText('Test client switched on.');
    expect(onChanged).toHaveBeenCalled();
  });

  it('moves a day forward and back', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Next day' }));
    expect(apiClient.post).toHaveBeenLastCalledWith('/admin/test-accounts/client/days', { days: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(apiClient.post).toHaveBeenLastCalledWith('/admin/test-accounts/client/days', { days: -1 });
  });

  it('skips by the step size, capped at the maximum', async () => {
    setup();
    const input = screen.getByLabelText('Days to move');
    await userEvent.clear(input);
    await userEvent.type(input, '99');
    await userEvent.click(screen.getByRole('button', { name: 'Skip forward' }));
    expect(apiClient.post).toHaveBeenLastCalledWith('/admin/test-accounts/client/days', { days: 14 });
  });

  it('only offers Back to today once the days have moved', async () => {
    setup();
    expect(screen.getByRole('button', { name: 'Back to today' })).toBeDisabled();
  });

  it('goes back to today', async () => {
    setup({ ...base, day_offset: 3, world_date: '2026-11-22' });
    await userEvent.click(screen.getByRole('button', { name: 'Back to today' }));
    expect(apiClient.post).toHaveBeenLastCalledWith('/admin/test-accounts/client/days', { back_to_today: true });
  });

  it('reports the checks that ran after a skip', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ checks: { alerts_created: 2, timesheets_created: 1 } });
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Next day' }));
    await screen.findByText(/2 alerts, 1 timesheets/);
  });

  it('shows a waiting note until both accounts are on', () => {
    setup({ ...base, present: false, client: null, place: null, visits: [] });
    expect(screen.getByText(/appears once both test accounts are on/)).toBeInTheDocument();
  });
});
