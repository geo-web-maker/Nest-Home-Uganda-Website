#!/usr/bin/env node
/** Dumps the nav and route tables by reading nav.ts and both router entrypoints with TypeScript's AST. */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); }
catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js'); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const before = process.argv.includes('--before');
const navFile = path.join(root, 'admin/src/features/admin/nav.ts');
const appFile = path.join(root, 'admin/src/features/admin/AdminApp.tsx');
const mainFile = path.join(root, 'admin/src/main.tsx');
const parse = (file, kind) => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, kind);
const navSource = parse(navFile, ts.ScriptKind.TS);
let navArray;
function visitNav(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(navSource) === 'ADMIN_NAV' && node.initializer && ts.isArrayLiteralExpression(node.initializer)) navArray = node.initializer;
  ts.forEachChild(node, visitNav);
}
visitNav(navSource);
if (!navArray) throw new Error('Could not find ADMIN_NAV array in nav.ts');
const property = (obj, name) => obj.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(navSource).replaceAll(/['"]/g, '') === name)?.initializer;
const string = (node) => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
const nav = navArray.elements.map((entry) => {
  const item = { path: string(property(entry, 'path')), labelKey: string(property(entry, 'labelKey')), scopes: (property(entry, 'scopes')?.elements ?? []).map(string).filter(Boolean) };
  if (before && item.path) item.path = item.path === '/' ? '/admin' : `/admin${item.path}`;
  return item;
});
const routePaths = new Set(nav.map((item) => item.path).filter(Boolean));
for (const [file, kind] of [[appFile, ts.ScriptKind.TSX], [mainFile, ts.ScriptKind.TSX]]) {
  const source = parse(file, kind);
  const collect = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(source) === 'Route') {
        const attr = node.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText(source) === 'path');
        if (attr?.initializer && ts.isStringLiteral(attr.initializer)) {
          const pathValue = attr.initializer.text;
          if (pathValue === '*') routePaths.add(before ? '/admin/*' : '/*');
          else if (pathValue !== 'admin/*' && pathValue !== '/*') routePaths.add(`/${pathValue.replace(/^\/+/, '')}`);
        }
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(source);
}
// The split-plan router had a temporary root-to-/admin redirect. The post-prefix router keeps a
// compatibility /admin/* redirect and mounts the app at the origin root.
if (before) { routePaths.add('/admin/*'); routePaths.add('/'); }
else { routePaths.add('/admin/*'); routePaths.add('/*'); }
const transform = (value) => before
  ? (value === '/' ? '/admin' : value.startsWith('/admin') ? value : `/admin${value}`)
  : value;
const routes = [...new Set([...routePaths].map(transform))].sort();
const result = {
  generated_from: ['admin/src/features/admin/nav.ts', 'admin/src/features/admin/AdminApp.tsx', 'admin/src/main.tsx'],
  mode: before ? 'pre-prefix-removal (inverse-transformed path snapshot)' : 'current',
  nav,
  routes,
};
const dir = path.join(root, 'docs/admin-prefix');
mkdirSync(dir, { recursive: true });
const suffix = before ? 'before' : 'after';
writeFileSync(path.join(dir, `nav-${suffix}.json`), JSON.stringify(nav, null, 2) + '\n');
writeFileSync(path.join(dir, `routes-${suffix}.json`), JSON.stringify(result, null, 2) + '\n');
console.log(`wrote docs/admin-prefix/nav-${suffix}.json and routes-${suffix}.json (${nav.length} nav items, ${routes.length} routes)`);
