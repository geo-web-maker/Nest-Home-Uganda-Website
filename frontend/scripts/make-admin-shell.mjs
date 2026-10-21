// Writes dist/admin-shell.html: dist/index.html with the pre-rendered home page and its page-specific
// head tags removed. The admin area is client-rendered, so Vercel (see vercel.json) and the e2e static
// server answer /admin/* with this shell. Serving dist/index.html instead leaves the pre-rendered home
// page on screen underneath the admin app.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const html = readFileSync(resolve(dist, 'index.html'), 'utf8');

const rootStart = html.indexOf('<div id="root"');
const rootEnd = html.indexOf('<script>window.__VITE_REACT_SSG_HASH__');
if (rootStart === -1 || rootEnd === -1 || rootEnd < rootStart) {
  throw new Error('make-admin-shell: could not find the pre-rendered root in dist/index.html');
}

const shell = (html.slice(0, rootStart) + '<div id="root"></div>\n' + html.slice(rootEnd))
  // Home-page title, description and social tags written by react-helmet-async during pre-render.
  .replace(/<title data-rh="true">[\s\S]*?<\/title>/g, '')
  .replace(/<(meta|link|script)\b[^>]*data-rh="true"[^>]*>(<\/script>)?/g, '')
  .replace(
    '<head>',
    '<head><title>Admin | Nest Home Care Uganda</title><meta name="robots" content="noindex">',
  );

writeFileSync(resolve(dist, 'admin-shell.html'), shell);
console.log(`make-admin-shell: wrote ${resolve(dist, 'admin-shell.html')}`);
