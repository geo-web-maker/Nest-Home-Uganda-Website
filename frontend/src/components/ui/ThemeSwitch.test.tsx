import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeSwitch } from './ThemeSwitch';

afterEach(() => { window.localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });

describe('ThemeSwitch', () => {
  it('exposes an accessible group and reflects the current choice', async () => {
    render(<ThemeSwitch label="Theme" lightLabel="Light" darkLabel="Dark" />);
    const group = screen.getByRole('group', { name: 'Theme' });
    expect(group).toBeInTheDocument();
    const light = screen.getByRole('button', { name: 'Light' });
    const dark = screen.getByRole('button', { name: 'Dark' });
    expect(light).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(dark);
    expect(dark).toHaveAttribute('aria-pressed', 'true');
    expect(light).toHaveAttribute('aria-pressed', 'false');
    expect(window.localStorage.getItem('nest-theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
