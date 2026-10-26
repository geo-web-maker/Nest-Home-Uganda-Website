import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Onboarding } from './Onboarding';

describe('nurse onboarding disclosure gate', () => {
  it('does not call the acceptance callback until the nurse explicitly accepts the location disclosure', () => {
    const onAccept = vi.fn();
    render(<Onboarding accepted={false} onAccept={onAccept} onContinue={vi.fn()} onEnableNotifications={vi.fn()} showNotifications notificationsEnabled={false} />);
    expect(screen.getByRole('heading', { name: /location and device permissions/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /enable notifications/i })).toBeNull();
    expect(onAccept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /accept and continue/i }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('makes notification opt-in optional after disclosure acceptance', () => {
    const onEnableNotifications = vi.fn();
    const onContinue = vi.fn();
    render(<Onboarding accepted onAccept={vi.fn()} onContinue={onContinue} onEnableNotifications={onEnableNotifications} showNotifications notificationsEnabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: /continue to visits/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onEnableNotifications).not.toHaveBeenCalled();
  });
});
