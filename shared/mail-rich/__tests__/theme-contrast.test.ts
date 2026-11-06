import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../react/mail-rich.css', import.meta.url), 'utf8');

/** Declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  return match ? match[1] : '';
}

describe('mail HTML is readable in light and dark app themes', () => {
  // Any surface that shows sanitised email HTML must set its own text colour AND background:
  // emails carry inline colours written for a light page, so inheriting the app theme can
  // leave dark text on a dark panel.
  for (const selector of ['.mr-paper', '.mr-quoted']) {
    it(`${selector} declares its own colour, background and colour-scheme`, () => {
      const body = rule(selector);
      expect(body).toMatch(/(^|[;\s])color\s*:/);
      expect(body).toMatch(/background\s*:/);
      expect(body).toMatch(/color-scheme\s*:\s*light/);
    });
  }

  it('maps the message theme variables to the app palette instead of a fixed dark fallback', () => {
    const body = rule('.mr-message');
    expect(body).toMatch(/--mr-fg\s*:\s*var\(--ink/);
    expect(body).toMatch(/--mr-line\s*:\s*var\(--line/);
  });
});
