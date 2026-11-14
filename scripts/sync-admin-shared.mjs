#!/usr/bin/env node
/** Syncs the exact canonical frontend/src shared closure into admin/src/_shared. */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'frontend', 'src');
const DEST = join(ROOT, 'admin', 'src', '_shared');
const GENERATED = '/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */\n';
const PATHS = [
  'components/ui', 'components/brand', 'components/security', 'components/dialogs',
  'features/agreements', 'design', 'lib', 'types', 'locales/en', 'hooks',
];
const args = new Set(process.argv.slice(2));
const check = args.has('--check');
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile()) files.push(file);
  }
}
for (const rel of PATHS) {
  const from = join(SOURCE, rel);
  if (existsSync(from)) walk(from);
}
const expected = new Set(files.map((file) => relative(SOURCE, file).split(sep).join('/')));
const differences = [];
for (const rel of expected) {
  const sourceFile = join(SOURCE, rel);
  const targetFile = join(DEST, rel);
  const ext = rel.slice(rel.lastIndexOf('.'));
  let data = readFileSync(sourceFile, 'utf8');
  if (['.ts', '.tsx', '.css'].includes(ext) && !data.startsWith(GENERATED)) data = GENERATED + data;
  if (!existsSync(targetFile) || readFileSync(targetFile, 'utf8') !== data) differences.push(rel);
}
const extras = [];
if (existsSync(DEST)) {
  const actual = [];
  const scan = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const f=join(dir,e.name); if(e.isDirectory()) scan(f); else if(e.isFile()) actual.push(relative(DEST,f).split(sep).join('/')); } };
  scan(DEST);
  for (const rel of actual) if (!expected.has(rel)) extras.push(rel);
}
if (check) {
  if (differences.length || extras.length) {
    console.error(`admin shared drift: ${differences.length} changed/missing, ${extras.length} extra`);
    for (const rel of differences) console.error(`  changed/missing: ${rel}`);
    for (const rel of extras) console.error(`  extra: ${rel}`);
    process.exit(1);
  }
  console.log(`admin shared copies match (${expected.size} files across ${PATHS.length} source groups)`);
} else {
  mkdirSync(DEST, { recursive: true });
  for (const rel of extras) rmSync(join(DEST, rel), { force: true });
  for (const rel of expected) {
    const sourceFile = join(SOURCE, rel);
    const targetFile = join(DEST, rel);
    mkdirSync(dirname(targetFile), { recursive: true });
    const ext = rel.slice(rel.lastIndexOf('.'));
    let data = readFileSync(sourceFile, 'utf8');
    if (['.ts', '.tsx', '.css'].includes(ext) && !data.startsWith(GENERATED)) data = GENERATED + data;
    writeFileSync(targetFile, data);
  }
  console.log(`synced ${expected.size} files to admin/src/_shared`);
}
