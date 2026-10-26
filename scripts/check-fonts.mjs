import fs from 'node:fs';
import path from 'node:path';
const roots = ['frontend/src', 'nurse/src'];
const forbidden = /fonts\.(googleapis|gstatic)\.com|use\.typekit\.net|fonts\.bunny\.net/i;
const hits = [];
function walk(dir) { if (!fs.existsSync(dir)) return; for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) walk(file); else if (/\.(tsx?|css|html)$/.test(file) && forbidden.test(fs.readFileSync(file, 'utf8'))) hits.push(file); } }
roots.forEach(walk);
if (hits.length) { console.error(hits.join('\n')); process.exit(1); }
console.log('No remote font providers referenced by frontend source.');
