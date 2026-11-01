import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('Nurse app offline workspace', () => {
  it('does not expose unscheduled visit creation before sign-in', () => {
    sessionStorage.removeItem('nurse_access_token');
    render(<App />);
    expect(screen.queryByRole('button', { name: 'Unscheduled visit' })).toBeNull();
  });

  it('shows the sign-in screen to a signed-out nurse', () => {
    sessionStorage.removeItem('nurse_access_token');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy();
  });
});
