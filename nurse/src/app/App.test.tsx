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

  it('renders the app name and offline-first purpose', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Well Nest Home Care Uganda' })).toBeTruthy();
    expect(screen.getByText(/visits stay available when the network is unavailable/i)).toBeTruthy();
  });
});
