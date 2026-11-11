// Serves ./dist the way static hosting does: /x -> dist/x, then dist/x/index.html, and
// unknown paths get dist/404.html with a 404 status.
// `vite preview` does not serve the pre-rendered nested pages, so it cannot be used here.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 4174);
// Optional single-page entry for local route testing.
const entry = process.argv[4];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};

let notFound = false;

function resolveFile(urlPath) {
  notFound = false;
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  const target = join(root, clean);
  if (!target.startsWith(root)) return null;
  if (existsSync(target) && statSync(target).isFile()) return target;
  const index = join(target, 'index.html');
  if (existsSync(index)) return index;
  // A build with a relative base ('./') may request assets from a nested route: serve them from /assets.
  const nested = /[/\\]assets[/\\](.+)$/.exec(clean);
  if (nested) {
    const asset = join(root, 'assets', nested[1]);
    if (asset.startsWith(root) && existsSync(asset) && statSync(asset).isFile()) return asset;
  }
  if (extname(clean)) return null;
  if (entry) return join(root, entry);
  // Unknown address: like Cloudflare (not_found_handling "404-page") answer with 404.html and a 404 status.
  notFound = true;
  return join(root, existsSync(join(root, '404.html')) ? '404.html' : 'index.html');
}

createServer((req, res) => {
  const file = resolveFile(new URL(req.url ?? '/', 'http://x').pathname);
  if (!file || !existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }
  res.writeHead(notFound ? 404 : 200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
