import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = process.argv[2] ?? 'dist';
const initialLimit = Number(process.env.MAX_GZIP_BYTES ?? 200 * 1024);
const chunkLimit = Number(process.env.MAX_ROUTE_CHUNK_GZIP_BYTES ?? 80 * 1024);
const isNurse = /(?:^|[\\/])nurse(?:[\\/])dist$/.test(path.resolve(root)) || path.resolve(root).endsWith(`${path.sep}nurse${path.sep}dist`);

if (!fs.existsSync(root)) {
  console.error(`Directory not found: ${root}`);
  process.exit(2);
}

const assets = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(js|css)$/.test(file)) assets.push(file);
  }
}
walk(root);

const sizes = assets.map((file) => ({ file, gzip: gzipSync(fs.readFileSync(file)).byteLength }));
const total = sizes.reduce((sum, item) => sum + item.gzip, 0);
const largest = [...sizes].sort((a, b) => b.gzip - a.gzip).slice(0, 10);

console.log(`Compressed JS/CSS bytes: ${total}; initial budget: ${initialLimit}`);
for (const item of largest) console.log(`  ${item.gzip} ${path.relative(root, item.file)}`);

let failed = false;
if (total > initialLimit) {
  console.error(`Initial bundle budget exceeded: ${total} > ${initialLimit}`);
  failed = true;
}
if (isNurse) {
  const routeChunks = sizes.filter((item) => /\.js$/.test(item.file) && !/(?:^|[\\/])index-[^/]+\.js$/.test(item.file));
  const oversized = routeChunks.filter((item) => item.gzip > chunkLimit);
  if (oversized.length) {
    console.error(`Nurse route chunk budget exceeded (${chunkLimit} bytes gzipped):`);
    oversized.forEach((item) => console.error(`  ${item.gzip} ${path.relative(root, item.file)}`));
    failed = true;
  }
  // `assets` holds path strings; the objects with a `file` field are in `sizes`.
  if (sizes.some((item) => /\.js$/.test(item.file) && /leaflet/i.test(fs.readFileSync(item.file, 'utf8')))) {
    console.error('Leaflet detected in the nurse bundle; admin-only map code must not enter nurse/dist.');
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
