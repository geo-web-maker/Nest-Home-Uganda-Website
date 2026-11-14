// Writes dist/agreement-shell.html and dist/404.html from the pre-rendered index. The standalone admin
// is hosted at admin.bhcug.com; this public site only needs a shell for dynamic agreement links.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const html = readFileSync(resolve(dist, 'index.html'), 'utf8');

const rootStart = html.indexOf('<div id="root"');
const rootEnd = html.indexOf('<script>window.__VITE_REACT_SSG_HASH__');
if (rootStart === -1 || rootEnd === -1 || rootEnd < rootStart) {
  throw new Error('make-admin-shell: could not find the pre-rendered root in dist/index.html');
}

const SHELLS = [
  ['agreement-shell.html', 'Your care agreement | Bloomwell Home Care Uganda'],
  // Served with a 404 status for any unknown address (Cloudflare not_found_handling "404-page", Vercel and
  // Pages pick up /404.html automatically). The router's catch-all route renders the branded not-found page.
  ['404.html', 'Page not found | Bloomwell Home Care Uganda'],
];

const NOSCRIPT =
  '<noscript><p style="font-family:system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem">' +
  'This page needs JavaScript. <a href="/">Go to the Bloomwell Home Care Uganda home page</a>.</p></noscript>';

for (const [file, title] of SHELLS) {
  const shell = (html.slice(0, rootStart) + '<div id="root"></div>\n' + NOSCRIPT + html.slice(rootEnd))
    // Home-page title, description and social tags written by react-helmet-async during pre-render.
    .replace(/<title data-rh="true">[\s\S]*?<\/title>/g, '')
    .replace(/<(meta|link|script)\b[^>]*data-rh="true"[^>]*>(<\/script>)?/g, '')
    .replace('<head>', `<head><title>${title}</title><meta name="robots" content="noindex">`);

  writeFileSync(resolve(dist, file), shell);
  console.log(`make-admin-shell: wrote ${resolve(dist, file)}`);
}
