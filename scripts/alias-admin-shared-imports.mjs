#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'admin', 'src');
const sharedRoots = [
  'components/ui', 'components/brand', 'components/security', 'components/dialogs',
  'features/agreements', 'design', 'lib', 'types', 'locales/en', 'hooks',
];
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '_shared') walk(full);
    } else if (/\.(?:ts|tsx|js|jsx|css)$/.test(entry.name)) files.push(full);
  }
}
walk(source);
let changed = 0;
const pattern = /(\bfrom\s*|\bimport\s*\(\s*|\bexport\s+(?:\*|\{[^}]*\})\s+from\s*)(['"])([^'"]+)\2/g;
for (const file of files) {
  const relativeFile = path.relative(source, file).split(path.sep).join('/');
  let text = readFileSync(file, 'utf8');
  const next = text.replace(pattern, (whole, prefix, quote, specifier) => {
    if (specifier.startsWith('@shared/')) return whole;
    let target;
    if (specifier.startsWith('@/')) target = path.posix.normalize(specifier.slice(2));
    else if (specifier.startsWith('.')) target = path.posix.normalize(path.posix.join(path.posix.dirname(relativeFile), specifier));
    else return whole;
    const rootPath = sharedRoots.find((item) => target === item || target.startsWith(item + '/'));
    if (!rootPath) return whole;
    // A file that exists locally in admin/src (for example lib/normalizeAdminUrl.ts) is not a shared copy.
    if (['', '.ts', '.tsx', '.js', '.css', '/index.ts', '/index.tsx'].some((ext) => existsSync(path.join(source, target + ext)))) return whole;
    return `${prefix}${quote}@shared/${target}${quote}`;
  });
  if (next !== text) { writeFileSync(file, next); changed++; }
}
console.log(`rewrote shared imports in ${changed} admin source files (${files.length} scanned)`);
