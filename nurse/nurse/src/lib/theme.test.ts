import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTheme, initTheme, setTheme } from './theme';

describe('nurse theme helper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.querySelector('meta[name="theme-color"]')?.remove();
  });

  it('defaults to light and ignores the OS preference', () => {
    window.localStorage.removeItem('nest-theme');
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    expect(getTheme()).toBe('light');
    expect(initTheme()).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('persists a chosen theme and updates html and theme-color meta', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
    setTheme('dark');
    expect(window.localStorage.getItem('nest-theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(meta.content).toBe('#091410');
    setTheme('light');
    expect(meta.content).toBe('#123524');
  });

  it('does not throw when localStorage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => setTheme('dark')).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(() => initTheme()).not.toThrow();
  });

  it('ignores invalid saved values', () => {
    window.localStorage.setItem('nest-theme', 'auto');
    expect(getTheme()).toBe('light');
  });
});
