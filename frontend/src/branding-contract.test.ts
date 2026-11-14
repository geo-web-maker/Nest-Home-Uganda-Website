import { describe, expect, it } from 'vitest';
import { siteEn } from './locales/en/site';

describe('Bloomwell Home Care Uganda branding contract', () => {
  it('uses the public brand on ordinary UI labels', () => {
    expect(siteEn.brand.name).toBe('Bloomwell Home Care Uganda');
    expect(siteEn.footer.copyright).toBe('© Bloomwell Home Care Uganda Limited');
  });

});
