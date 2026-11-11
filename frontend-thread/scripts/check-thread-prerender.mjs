import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? 'dist';
const routes = ['/', '/services', '/how-it-works', '/about', '/team', '/areas', '/faq', '/privacy', '/careers', '/contact'];
let failures = 0;
if (!fs.existsSync(root)) { console.error(`Directory not found: ${root}`); process.exit(2); }
for (const route of routes) {
  const file = path.join(root, route === '/' ? 'index.html' : `${route.slice(1)}/index.html`);
  if (!fs.existsSync(file)) { console.error(`MISSING ${route}: ${file}`); failures++; continue; }
  const html = fs.readFileSync(file, 'utf8');
  const h1 = (html.match(/<h1[\s>]/gi) ?? []).length;
  const hasTitle = /<title[^>]*>[^<]+<\/title>/i.test(html);
  const hasDescription = /<meta[^>]+name=["']description["'][^>]+content=["'][^"']+["']/i.test(html);
  if (h1 !== 1 || !hasTitle || !hasDescription) {
    console.error(`FAIL ${route}: h1=${h1}, title=${hasTitle}, description=${hasDescription}`); failures++;
  } else console.log(`OK ${route}: one h1, title and description present in raw HTML`);
}
process.exit(failures ? 1 : 0);
