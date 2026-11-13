// Writes dist/404.html: dist/index.html with the pre-rendered home page removed, so unknown addresses
// get a 404 status (Cloudflare not_found_handling "404-page"; Vercel picks up /404.html automatically).
// The router's catch-all route then renders the branded not-found page on the client.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const html = readFileSync(resolve(dist, 'index.html'), 'utf8');

const rootStart = html.indexOf('<div id="root"');
const rootEnd = html.indexOf('<script>window.__VITE_REACT_SSG_HASH__');
if (rootStart === -1 || rootEnd === -1 || rootEnd < rootStart) {
  throw new Error('make-404: could not find the pre-rendered root in dist/index.html');
}

const NOSCRIPT =
  '<noscript><p style="font-family:system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem">' +
  'This page needs JavaScript. <a href="/">Go to the home page</a>.</p></noscript>';

const page = (html.slice(0, rootStart) + '<div id="root"></div>\n' + NOSCRIPT + html.slice(rootEnd))
  .replace(/<title data-rh="true">[\s\S]*?<\/title>/g, '')
  .replace(/<(meta|link|script)\b[^>]*data-rh="true"[^>]*>(<\/script>)?/g, '')
  .replace('<head>', '<head><title>Page not found</title><meta name="robots" content="noindex">');

writeFileSync(resolve(dist, '404.html'), page);
console.log(`make-404: wrote ${resolve(dist, '404.html')}`);
