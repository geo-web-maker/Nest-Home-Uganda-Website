import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginScreen } from './LoginScreen';

describe('nurse sign-in screen', () => {
  it('explains offline sign-in and prevents submission without a connection', () => {
    const onSubmit = vi.fn();
    render(<LoginScreen identifier="" password="" busy={false} online={false} onIdentifier={vi.fn()} onPassword={vi.fn()} onSubmit={onSubmit} />);
    expect(screen.getByRole('status').textContent).toMatch(/connect to the internet/i);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(screen.getByText('Forgot password?')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /choose colour theme/i })).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the nest logo inside the sign-in card, as in the approved mockup', () => {
    const { container } = render(<LoginScreen identifier="" password="" busy={false} online onIdentifier={vi.fn()} onPassword={vi.fn()} onSubmit={vi.fn()} />);
    expect(container.querySelector('.login-panel .login-mark svg')).not.toBeNull();
    expect(container.textContent).not.toContain('✦');
  });

  it('passes account and password changes to session state', () => {
    const onIdentifier = vi.fn(); const onPassword = vi.fn();
    render(<LoginScreen identifier="" password="" busy={false} online onIdentifier={onIdentifier} onPassword={onPassword} onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/email or phone/i), { target: { value: 'nurse@example.test' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret' } });
    expect(onIdentifier).toHaveBeenCalledWith('nurse@example.test');
    expect(onPassword).toHaveBeenCalledWith('secret');
  });
});
