/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeSwitch } from './ThemeSwitch';

afterEach(() => { window.localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });

describe('ThemeSwitch', () => {
  it('is one icon button that names the mode it switches to and toggles on click', async () => {
    render(<ThemeSwitch label="Theme" lightLabel="Light" darkLabel="Dark" />);
    const button = screen.getByRole('button', { name: 'Theme: Dark' });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAccessibleName('Theme: Light');
    expect(window.localStorage.getItem('nest-theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    await userEvent.click(button);
    expect(window.localStorage.getItem('nest-theme')).toBe('light');
  });
});
