#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyTree } from './lib/classify.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { hits, flags, files } = classifyTree(path.join(root, 'admin', 'src'));
const groups = ['API', 'PAGE', 'AMBIGUOUS'];
const counts = Object.fromEntries(groups.map((name) => [name, hits.filter((item) => item.classification === name).length]));
const md = [
  '# Admin URL prefix classification', '',
  `Scanned ${files.length} TypeScript source/test files. Total literal hits: **${hits.length}**.`,
  `- API: ${counts.API}`, `- PAGE: ${counts.PAGE}`, `- AMBIGUOUS: ${counts.AMBIGUOUS}`, '',
  'The earlier repository-wide estimate in the plan is 387 non-test and 174 test occurrences. This report is specific to the copied standalone app and its tests.',
  '',
];
for (const group of groups) {
  md.push(`## ${group}`, '', '| File:line | Literal | Rule / resolution | Source |', '|---|---|---|---|');
  for (const item of hits.filter((x) => x.classification === group)) {
    md.push(`| \`${path.relative(root, item.file)}:${item.line}\` | \`${item.literal.replaceAll('|','\\|')}\` | ${item.reason} | \`${item.statement.replaceAll('|','\\|')}\` |`);
  }
  md.push('');
}
md.push('## Non-literal / pathname-derived forms', '', '| File:line | Form | Source |', '|---|---|---|');
for (const item of flags) md.push(`| \`${path.relative(root, item.file)}:${item.line}\` | ${item.form} | \`${item.text.replaceAll('|','\\|')}\` |`);
md.push('', '## Ambiguity policy', '', 'Ambiguous literals are deliberately left unchanged by the codemod and treated as API until a human/code review establishes otherwise. Each ambiguity above includes its source statement.', '');
const out = path.join(root, 'docs/admin-prefix/CLASSIFICATION.md');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, md.join('\n'));
console.log(`wrote ${path.relative(root, out)}; ${hits.length} hits (${counts.API} API, ${counts.PAGE} PAGE, ${counts.AMBIGUOUS} ambiguous); ${flags.length} non-literal flags`);
