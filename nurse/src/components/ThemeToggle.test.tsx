import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('switches between light and dark and saves the choice', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: 'Dark' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('nest-theme')).toBe('dark');
    fireEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
