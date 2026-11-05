/* GENERATED from shared/mail-rich. Edit there, then run: node scripts/sync-mail-rich.mjs */
/** Shared mail-rich mirror drift guard. Written, not run here. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '../../../../../shared/mail-rich');
const mirror = path.resolve(here, '..');
const header = '/* GENERATED from shared/mail-rich. Edit there, then run: node scripts/sync-mail-rich.mjs */\n';

function walk(directory: string, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'README.md') return [];
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? walk(path.join(directory, entry.name), relative) : [relative];
  }).sort();
}

describe('shared mail-rich generated mirrors', () => {
  it('matches the authoring folder when it is present in this checkout', () => {
    if (!existsSync(source)) return;
    const files = walk(source);
    expect(walk(mirror)).toEqual(files);
    for (const relative of files) {
      const original = readFileSync(path.join(source, relative), 'utf8');
      const expected = /\.(ts|tsx|css)$/.test(relative) ? header + original : original;
      expect(readFileSync(path.join(mirror, relative), 'utf8')).toBe(expected);
    }
  });
});
