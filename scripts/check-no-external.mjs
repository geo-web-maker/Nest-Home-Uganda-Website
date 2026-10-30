import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] ?? 'dist';
// Beside this script, so the result does not depend on the directory the guard is run from
// (nurse.yml runs it from nurse/, ci.yml from the repository root).
const allowlistPath = fileURLToPath(new URL('./external-allowlist.txt', import.meta.url));
const allowlist = fs.existsSync(allowlistPath) ? fs.readFileSync(allowlistPath, 'utf8').split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('#')) : [];
// ';' and ',' end a host too: CSP lines in dist/_headers read "connect-src 'self' https://host; frame-ancestors ...".
const external = /https?:\/\/([^/"'\s)>;,]+)/g;
const files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) walk(file); else files.push(file); } }
if (!fs.existsSync(root)) { console.error(`Directory not found: ${root}`); process.exit(2); }
walk(root);
const failures = [];
for (const file of files) {
  const body = fs.readFileSync(file, 'utf8');
  for (const match of body.matchAll(external)) {
    const host = match[1].toLowerCase();
    if (!['localhost', '127.0.0.1'].includes(host) && !allowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) failures.push(`${file}: ${host}`);
  }
}
if (failures.length) { console.error('Unexpected external URLs:'); console.error(failures.join('\n')); process.exit(1); }
console.log('No unexpected external URLs found.');
