import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards the shared construction of the nurse UI. Screens must build panels, buttons, sheets,
 * notices and status pills from src/ui so they cannot drift into slightly different markup.
 */
const srcRoot = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

const screens = sourceFiles(srcRoot).filter((path) => !relative(srcRoot, path).startsWith('ui/'));
const rel = (path: string) => relative(srcRoot, path).replaceAll('\\', '/');

/** Bespoke interactive surfaces that are not pill buttons: row toggles, thumbnails, the SOS hold button. */
const bespokeButtons: Record<string, number> = {
  'features/sos/SosSheet.tsx': 1,
  'features/timesheets/TimesheetsScreen.tsx': 1,
  'pwa/InstallHint.tsx': 1,
  'screens/ActiveVisit.tsx': 2,
  'screens/HistoryScreen.tsx': 1,
  'screens/PhotoSheet.tsx': 2,
};

const legacyClasses = ['panel', 'notice', 'status-chip', 'button-secondary', 'button-danger', 'sheet', 'sheet-backdrop', 'sheet-handle', 'sheet-actions'];

describe('shared UI construction', () => {
  it('does not use legacy panel, notice, chip, button or sheet classes outside src/ui', () => {
    const offenders: string[] = [];
    for (const path of screens) {
      const text = readFileSync(path, 'utf8');
      for (const match of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const tokens = (match[1] ?? match[2] ?? '').split(/\s+/);
        for (const legacy of legacyClasses) if (tokens.includes(legacy)) offenders.push(`${rel(path)}: ${legacy}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps raw <button> elements to the known bespoke surfaces', () => {
    const counts: Record<string, number> = {};
    for (const path of screens) {
      const count = (readFileSync(path, 'utf8').match(/<button\b/g) ?? []).length;
      if (count > 0) counts[rel(path)] = count;
    }
    expect(counts).toEqual(bespokeButtons);
  });

  it('builds every dialog through the Sheet component', () => {
    const offenders = screens.filter((path) => /aria-modal=/.test(readFileSync(path, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
  });
});
