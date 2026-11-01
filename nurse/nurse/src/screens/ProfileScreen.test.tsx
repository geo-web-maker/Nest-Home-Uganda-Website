import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ProfileScreen } from './ProfileScreen';
import type { FieldProfile } from '../app/useFieldProfile';

function renderProfile(profile: FieldProfile | null = null, actions: { onCheckUpdate?: () => void; onLogout?: () => void } = {}) {
  return render(<MemoryRouter><ProfileScreen
    profile={profile} appVersion="0.1.0" versionInfo={null} remindersEnabled={false}
    inboxEnabled={false} inbox={[]} inboxMessage="" visits={[]} busy={false}
    onSync={vi.fn()} onEnableReminders={vi.fn()} onDisableReminders={vi.fn()}
    onCheckUpdate={actions.onCheckUpdate ?? vi.fn()} onLogout={actions.onLogout ?? vi.fn()}
  /></MemoryRouter>);
}

// The device and account details sit in a closed <details>; jsdom still renders their text, so
// check that the value exists only inside that disclosure, never in the visible profile card.
function expectOnlyInsideDeviceDisclosure(container: HTMLElement, text: string) {
  const device = container.querySelector('#profile-device') as HTMLElement;
  expect(device).not.toHaveAttribute('open');
  expect(within(device).getByText(text)).toBeInTheDocument();
  expect(screen.getAllByText(text).every((el) => device.contains(el))).toBe(true);
}

describe('nurse profile identity', () => {
  it('shows the nurse identity and assigned supervisor without opening device details', () => {
    const profile: FieldProfile = {
      user_id: 'nurse-42', display_name: 'Amina Nakato', email: 'amina@example.test',
      supervisor_name: 'Ruth Namusoke', staff_number: 'NC-0042', consents_required: [],
    };
    const { container } = renderProfile(profile);
    expect(screen.getByRole('heading', { name: 'Amina Nakato' })).toBeInTheDocument();
    expect(screen.getByText('amina@example.test')).toBeInTheDocument();
    expect(screen.getByText(/Ruth Namusoke/)).toBeInTheDocument();
    expect(container.querySelector('.mk-profile-staff')).toHaveTextContent('NC-0042');
    expectOnlyInsideDeviceDisclosure(container, 'nurse-42');
  });

  it('uses a neutral fallback when the offline identity cache is empty', () => {
    renderProfile();
    expect(screen.getByRole('heading', { name: 'Signed-in account' })).toBeInTheDocument();
  });

  it('hides an unassigned supervisor and keeps the account reference inside the disclosure', () => {
    const profile: FieldProfile = { user_id: 'nurse-43', display_name: 'Grace Nanyonga', consents_required: [] };
    const { container } = renderProfile(profile);
    expect(screen.queryByText(/Supervisor:/)).toBeNull();
    expectOnlyInsideDeviceDisclosure(container, 'nurse-43');
    fireEvent.click(screen.getByText('Device and account details'));
    expect(screen.getByText('nurse-43')).toBeInTheDocument();
  });

  it('routes update and sign-out actions through their existing handlers', () => {
    const onCheckUpdate = vi.fn(); const onLogout = vi.fn();
    renderProfile(null, { onCheckUpdate, onLogout });
    fireEvent.click(screen.getByRole('button', { name: /check for update/i }));
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(onCheckUpdate).toHaveBeenCalledTimes(1);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});

describe('profile device guidance', () => {
  it('explains foreground-only location and manual system settings access', () => {
    renderProfile();
    fireEvent.click(screen.getByText('Permissions help', { selector: 'summary' }));
    expect(screen.getByText(/background location capture is not implemented in this build/i)).toBeTruthy();
    expect(screen.getByText(/open your phone settings app manually/i)).toBeTruthy();
    expect(screen.getByText(/notifications are optional/i)).toBeTruthy();
  });

  it('does not require background-location permission to use this build', () => {
    renderProfile();
    fireEvent.click(screen.getByText('Permissions help', { selector: 'summary' }));
    expect(screen.getByText(/you do not need to disable battery optimisation for background tracking/i)).toBeTruthy();
  });
});
