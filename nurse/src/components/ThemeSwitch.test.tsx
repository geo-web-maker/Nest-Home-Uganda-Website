import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeSwitch } from './ThemeSwitch';

afterEach(() => { window.localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });

describe('nurse ThemeSwitch', () => {
  it('offers accessible Light and Dark buttons and persists selection', () => {
    render(<ThemeSwitch />);
    expect(screen.getByRole('group', { name: /choose colour theme/i })).toBeInTheDocument();
    const dark = screen.getByRole('button', { name: 'Dark' });
    fireEvent.click(dark);
    expect(dark).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('nest-theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
