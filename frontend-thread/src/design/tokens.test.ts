import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/design/tokens.css'), 'utf8');

const expected: Record<string, string[]> = {
  '--paper': ['#F2F8F6', '#0A201E'],
  '--paper-2': ['#DDF0EC', '#133733'],
  '--paper-3': ['#FCE6C4', '#1B413C'],
  '--card': ['#FBFEFD', '#1F4F49'],
  '--ink': ['#0B2E2A', '#F2F8F6'],
  '--ink-2': ['#2C4A47', '#D6E4E0'],
  '--muted': ['#47615E', '#A7C2BC'],
  '--rule': ['#CAD9D5', '#7A9E97'],
  '--rule-strong': ['#0B2E2A', '#8FB0A9'],
  '--line-field': ['#7C9A95', '#7FA39C'],
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

describe('Dark theme separation', () => {
  const dark = css.slice(css.indexOf(':root[data-theme="dark"] {'));
  const hex = (t: string) => new RegExp(`${t}:\\s*(#[0-9A-Fa-f]{6})`).exec(dark)![1]!;
  const lum = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };
  it('keeps cards and bands visibly apart from the page', () => {
    expect(ratio(hex('--card'), hex('--paper'))).toBeGreaterThanOrEqual(1.7);
    expect(ratio(hex('--paper-2'), hex('--paper'))).toBeGreaterThanOrEqual(1.3);
    expect(ratio(hex('--paper-3'), hex('--paper-2'))).toBeGreaterThanOrEqual(1.1);
    expect(ratio(hex('--hero-bg'), hex('--paper'))).toBeGreaterThanOrEqual(2);
    expect(ratio(hex('--cta-bg'), hex('--paper'))).toBeGreaterThanOrEqual(1.5);
  });
  it('keeps card edges at 3:1 on the card and on every band', () => {
    for (const bg of ['--card', '--paper', '--paper-2', '--paper-3']) expect(ratio(hex('--rule'), hex(bg)), bg).toBeGreaterThanOrEqual(3);
  });
  it('draws rules and field edges at 3:1 or better on the page', () => {
    for (const t of ['--rule', '--rule-strong', '--line-field']) expect(ratio(hex(t), hex('--paper')), t).toBeGreaterThanOrEqual(3);
  });
});
