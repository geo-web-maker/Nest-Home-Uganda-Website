import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? 'dist';
const allowlistPath = path.resolve('scripts/external-allowlist.txt');
const allowlist = fs.existsSync(allowlistPath) ? fs.readFileSync(allowlistPath, 'utf8').split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : [];
const external = /https?:\/\/([^/"'\s)>]+)/g;
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
