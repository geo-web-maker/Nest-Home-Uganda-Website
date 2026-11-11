import fs from 'node:fs';
import path from 'node:path';

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['src', 'index.html'];
const forbidden = /fonts\.(googleapis|gstatic)\.com|use\.typekit\.net|fonts\.bunny\.net/i;
const hits = [];

function inspectFile(file) {
  if (/\.(tsx?|css|html)$/.test(file) && forbidden.test(fs.readFileSync(file, 'utf8'))) hits.push(file);
}
function walk(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isFile()) { inspectFile(target); return; }
  if (!stat.isDirectory()) return;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const file = path.join(target, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile()) inspectFile(file);
  }
}

roots.forEach(walk);
if (hits.length) { console.error(hits.join('\n')); process.exit(1); }
console.log('No remote font providers referenced by Thread source.');
