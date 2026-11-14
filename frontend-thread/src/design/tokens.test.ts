import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/design/tokens.css'), 'utf8');

const expected: Record<string, string[]> = {
  '--paper': ['#F2F8F6', '#0A201E'],
  '--paper-2': ['#DDF0EC', '#071A18'],
  '--paper-3': ['#FCE6C4', '#12332F'],
  '--card': ['#FBFEFD', '#0E2A28'],
  '--ink': ['#0B2E2A', '#F2F8F6'],
  '--ink-2': ['#2C4A47', '#D6E4E0'],
  '--muted': ['#47615E', '#A7C2BC'],
  '--rule': ['#CAD9D5', '#1F4440'],
  '--rule-strong': ['#0B2E2A', '#5B7F79'],
  '--line-field': ['#7C9A95', '#5B7F79'],
  '--accent': ['#F8991E', '#FBA94A'],
  '--accent-hover': ['#FAA93D', '#FDC87A'],
  '--accent-ink': ['#1B1706', '#1B1706'],
  '--num': ['#08675F', '#6FD3C5'],
  '--link': ['#08675F', '#6FD3C5'],
  '--focus': ['#08675F', '#FBA94A'],
  '--danger': ['#B3261E', '#FF9A8F'],
};

function declarations(token: string) {
  return [...css.matchAll(new RegExp(`${token}\\s*:\\s*([^;]+)`, 'g'))].map((m) => m[1]!.trim());
}

describe('Thread design tokens', () => {
  it('keeps the reviewed light and dark palette values', () => {
    for (const [token, values] of Object.entries(expected)) {
      const actual = declarations(token);
      expect(actual[0], `${token} light`).toBe(values[0]);
      expect(actual[1], `${token} dark`).toBe(values[1]);
    }
  });

  it('defines the three reusable surface scopes', () => {
    expect(css).toContain('.on-hero {');
    expect(css).toContain('.on-strong {');
    expect(css).toContain('.on-cta {');
  });
});
