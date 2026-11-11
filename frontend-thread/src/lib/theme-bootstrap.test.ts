import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.resolve(here, '../../index.html'), 'utf8');

describe('public HTML theme bootstrap', () => {
  it('applies a valid saved theme before the application root is parsed', () => {
    expect(html.match(/name="theme-color"/g)).toHaveLength(1);
    expect(html).toContain("getItem('nest-theme')");
    expect(html).toContain("saved === 'light' || saved === 'dark'");
    expect(html).toContain("document.documentElement.dataset.theme = theme");
    expect(html.indexOf('nest-theme')).toBeLessThan(html.indexOf('id="root"'));
  });

  it('does not infer the theme from the operating system', () => {
    expect(html).not.toContain('prefers-color-scheme');
  });
});
