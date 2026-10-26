import fs from 'node:fs';
import path from 'node:path';
const source = path.resolve('../frontend/public/fonts');
const target = path.resolve('public/fonts');
if (!fs.existsSync(source)) { console.log('No shared self-hosted font directory found; no fonts copied.'); process.exit(0); }
fs.mkdirSync(target, { recursive: true });
for (const name of fs.readdirSync(source)) { const from = path.join(source, name); if (fs.statSync(from).isFile()) fs.copyFileSync(from, path.join(target, name)); }
console.log('Copied self-hosted font assets.');
