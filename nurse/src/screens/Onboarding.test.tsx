import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Onboarding } from './Onboarding';

describe('nurse onboarding disclosure gate', () => {
  it('requires both notice acknowledgements before acceptance', () => {
    const onAccept = vi.fn();
    render(<Onboarding accepted={false} onAccept={onAccept} onContinue={vi.fn()} onEnableNotifications={vi.fn()} showNotifications notificationsEnabled={false} />);
    expect(screen.getByRole('heading', { name: /before you start/i })).toBeInTheDocument();
    expect(screen.getByText(/full privacy notice, version 1/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept and continue/i })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/read the privacy notice/i));
    expect(onAccept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/agree to my location/i));
    fireEvent.click(screen.getByRole('button', { name: /accept and continue/i }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('shows the location explanation before continuing', () => {
    const onContinue = vi.fn();
    render(<Onboarding accepted onAccept={vi.fn()} onContinue={onContinue} onEnableNotifications={vi.fn()} showNotifications notificationsEnabled={false} />);
    expect(screen.getByRole('heading', { name: /why we ask for location/i })).toBeInTheDocument();
    expect(screen.getByText(/only when you tap arrive or leave/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
