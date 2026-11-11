import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/design/tokens.css'), 'utf8');

const expected: Record<string, string[]> = {
  '--paper': ['#F3F8F1', '#0E251B'],
  '--paper-2': ['#DFF0E6', '#0A1C14'],
  '--paper-3': ['#E9DDB8', '#1A3326'],
  '--card': ['#FBFDFA', '#12301F'],
  '--ink': ['#123524', '#F4F1DF'],
  '--ink-2': ['#2F4A3B', '#D9DFCB'],
  '--muted': ['#4A6354', '#A9BBAA'],
  '--rule': ['#CBD8C6', '#274636'],
  '--rule-strong': ['#123524', '#5B7A66'],
  '--line-field': ['#7E9886', '#5B7A66'],
  '--accent': ['#C79A3B', '#E3BB62'],
  '--accent-hover': ['#D8AC4C', '#EFCB7E'],
  '--accent-ink': ['#1B1706', '#1B1706'],
  '--num': ['#18784D', '#7FD1A6'],
  '--link': ['#18784D', '#7FD1A6'],
  '--focus': ['#18784D', '#E3BB62'],
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
