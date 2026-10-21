// Serves ./dist the way static hosting does: /x -> dist/x, then dist/x/index.html, and
// anything else falls back to dist/index.html (the admin area is client-side routed).
// `vite preview` does not serve the pre-rendered nested pages, so it cannot be used here.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 4173);

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

function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  const target = join(root, clean);
  if (!target.startsWith(root)) return null;
  if (existsSync(target) && statSync(target).isFile()) return target;
  const index = join(target, 'index.html');
  if (existsSync(index)) return index;
  if (extname(clean)) return null;
  // Same as the vercel.json rewrite: /admin/* gets the clean shell, everything else the home page.
  return join(root, /^[/\\]admin([/\\]|$)/.test(clean) ? 'admin-shell.html' : 'index.html');
}

createServer((req, res) => {
  const file = resolveFile(new URL(req.url ?? '/', 'http://x').pathname);
  if (!file || !existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
