import { describe, expect, it } from 'vitest';
import { copy } from './copy';

describe('Bloomwell Home Care Uganda nurse branding contract', () => {
  it('uses the public brand for the nurse app label', () => {
    expect(copy.appName).toBe('Bloomwell Home Care Uganda');
    expect(copy.appShortName).toBe('Bloomwell Home Care Uganda');
  });

  it('keeps the Ltd name for the legal organisation field', () => {
    expect(copy.organisation).toBe('Bloomwell Home Care Uganda Limited');
  });
});
