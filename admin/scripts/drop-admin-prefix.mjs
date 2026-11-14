#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyTree } from './lib/classify.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = path.join(root, 'admin', 'src');
const dryRun = process.argv.includes('--dry-run');
const { hits } = classifyTree(src);
const pageHits = hits.filter((hit) => hit.classification === 'PAGE');
const byFile = new Map();
for (const hit of pageHits) {
  const list = byFile.get(hit.file) ?? [];
  list.push(hit);
  byFile.set(hit.file, list);
}
let changed = 0;
for (const [file, fileHits] of byFile) {
  let source = readFileSync(file, 'utf8');
  for (const hit of fileHits.sort((a, b) => b.start - a.start)) {
    const before = source.slice(hit.start, hit.end);
    // Only remove the leading URL path segment. Query strings and hashes remain intact.
    const after = before.replace(/^([`'"])\/admin(.*)$/, (_match, quote, tail) => `${quote}${tail.startsWith('/') ? tail : `/${tail}`}`);
    if (after !== before) {
      source = source.slice(0, hit.start) + after + source.slice(hit.end);
      changed += 1;
    }
  }
  if (!dryRun) writeFileSync(file, source);
}
console.log(`${dryRun ? 'Would rewrite' : 'Rewrote'} ${changed} PAGE literals in ${byFile.size} files; API (${hits.filter((x) => x.classification === 'API').length}) and AMBIGUOUS (${hits.filter((x) => x.classification === 'AMBIGUOUS').length}) left unchanged.`);
