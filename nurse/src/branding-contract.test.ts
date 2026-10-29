import { describe, expect, it } from 'vitest';
import { copy } from './copy';

describe('Well Nest Home Care Uganda nurse branding contract', () => {
  it('uses the public brand for the nurse app label', () => {
    expect(copy.appName).toBe('Well Nest Home Care Uganda');
    expect(copy.appShortName).toBe('Well Nest Home Care Uganda');
  });

  it('keeps the Ltd name for the legal organisation field', () => {
    expect(copy.organisation).toBe('Well Nest Home Care Uganda Ltd');
  });
});
