import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeSwitch } from './ThemeSwitch';

afterEach(() => { window.localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });

describe('nurse ThemeSwitch', () => {
  it('is one button that names the mode it switches to and persists the choice', () => {
    render(<ThemeSwitch />);
    const toggle = screen.getByRole('button', { name: /choose colour theme: dark/i });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('nest-theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
