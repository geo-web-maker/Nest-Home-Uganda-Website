#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'shared', 'mail-rich');
const destinations = [
  path.join(root, 'frontend', 'src', 'shared', 'mail-rich'),
  path.join(root, 'nurse', 'src', 'shared', 'mail-rich'),
];
const check = process.argv.includes('--check');
const header = '/* GENERATED from shared/mail-rich. Edit there, then run: node scripts/sync-mail-rich.mjs */\n';

async function filesBelow(directory, prefix = '') {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.name === 'README.md') continue;
    const relative = path.join(prefix, item.name);
    if (item.isDirectory()) result.push(...(await filesBelow(path.join(directory, item.name), relative)));
    else result.push(relative);
  }
  return result.sort();
}

const relativeFiles = await filesBelow(source);
let failed = false;
for (const destination of destinations) {
  const expected = new Set(relativeFiles);
  if (!check) await mkdir(destination, { recursive: true });
  const currentFiles = existsSync(destination) ? await filesBelow(destination).catch(() => []) : [];
  for (const extra of currentFiles.filter((item) => !expected.has(item))) {
    failed = true;
    if (!check) await rm(path.join(destination, extra), { force: true });
  }
  for (const relative of relativeFiles) {
    const sourcePath = path.join(source, relative);
    const targetPath = path.join(destination, relative);
    const raw = await readFile(sourcePath, 'utf8');
    const generated = /\.(ts|tsx|css)$/.test(relative) ? header + raw : raw;
    if (check) {
      let actual = '';
      try {
        actual = await readFile(targetPath, 'utf8');
      } catch {
        // Missing mirrors are treated as drift.
      }
      if (actual !== generated) {
        process.stderr.write(`mail-rich mirror drift: ${path.relative(root, targetPath)}\n`);
        failed = true;
      }
    } else {
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, generated, 'utf8');
    }
  }
}
if (check && failed) process.exitCode = 1;
if (!check) process.stdout.write('Synced shared/mail-rich into frontend and nurse mirrors.\n');
