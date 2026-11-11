import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2] ?? 'dist';
const forbidden = /[\u{1F300}-\u{1FAFF}]/u;
const files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) walk(file); else if (/\.(js|html|json)$/.test(file)) files.push(file); } }
if (!fs.existsSync(root)) { console.error(`Directory not found: ${root}`); process.exit(2); }
walk(root);
const bad = files.filter((file) => forbidden.test(fs.readFileSync(file, 'utf8')));
if (bad.length) { console.error(`Emoji-like Unicode found in: ${bad.join(', ')}`); process.exit(1); }
console.log('No emoji-like Unicode found in output.');
