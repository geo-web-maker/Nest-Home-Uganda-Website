import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileScreen } from './ProfileScreen';

function renderProfile() {
  return render(<ProfileScreen
    profile={null} appVersion="0.1.0" versionInfo={null} remindersEnabled={false}
    inboxEnabled={false} inbox={[]} inboxMessage="" visits={[]} busy={false}
    onSync={vi.fn()} onEnableReminders={vi.fn()} onDisableReminders={vi.fn()}
    onCheckUpdate={vi.fn()} onLogout={vi.fn()}
  />);
}

describe('profile device guidance', () => {
  it('explains foreground-only location and manual system settings access', () => {
    renderProfile();
    fireEvent.click(screen.getByText('Permissions help'));
    expect(screen.getByText(/background location capture is not implemented in this build/i)).toBeTruthy();
    expect(screen.getByText(/open your phone settings app manually/i)).toBeTruthy();
    expect(screen.getByText(/notifications are optional/i)).toBeTruthy();
  });

  it('does not require background-location permission to use this build', () => {
    renderProfile();
    fireEvent.click(screen.getByText('Permissions help'));
    expect(screen.getByText(/you do not need to disable battery optimisation for background tracking/i)).toBeTruthy();
  });
});
