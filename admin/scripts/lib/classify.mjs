import { createRequire } from 'node:module';
import path from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); }
catch {
  try { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js'); }
  catch { throw new Error('TypeScript is required; install admin dependencies before running the admin-prefix classifier.'); }
}

export const PREFIX_RE = /^\/admin(?:\/|\?|#|$)/;
const API_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'getBlob', 'request', 'upload']);
const PAGE_CALLS = new Set(['navigate', 'redirect', 'goto', 'waitForURL', 'toHaveURL']);
const TEST_API_ASSERTIONS = new Set(['toHaveBeenCalledWith', 'toHaveBeenLastCalledWith', 'toHaveBeenNthCalledWith']);

function allFiles(dir, output = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '_shared') allFiles(file, output);
    } else if (/\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) output.push(file);
  }
  return output;
}
function nameOf(node) {
  if (!node) return '';
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isStringLiteral(node)) return node.text;
  return '';
}
function expressionRoot(node) {
  return ts.isTemplateHead(node) && ts.isTemplateExpression(node.parent) ? node.parent : node;
}
function contains(parent, child) {
  for (let node = child; node; node = node.parent) if (node === parent) return true;
  return false;
}
function isApiArgument(root, file, sourceText) {
  // Repository-specific wrappers/maps confirmed by reading their implementations.
  if (/features\/admin\/care\/(?:CareScreenPage|CareWorkspace)\.tsx$/.test(file)) {
    if (/CareWorkspace\.tsx$/.test(file)) return true; // `paths` is consumed only by apiClient.get; all other prefixed literals are API calls.
    for (let p = root.parent; p; p = p.parent) {
      if (ts.isCallExpression(p) && nameOf(p.expression) === 'act' && p.arguments[0] && contains(p.arguments[0], root)) return true;
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && p.name.text === 'endpoint' && p.initializer && contains(p.initializer, root)) return true;
    }
  }
  if (/features\/admin\/users\/UsersPage\.test\.tsx$/.test(file)) return true; // Mocked apiClient paths and assertions.
  if (/features\/admin\/(?:GovernancePages|activity\/ActivityPage|care\/CareWorkspace|care\/clients\/ClientDetailPage|settings\/SettingsPage)\.test\.tsx$/.test(file)) return true; // Mocked API request paths in tests.
  if (/features\/admin\/care\/AlertAndTimesheetPages\.tsx$/.test(file)) return true; // Local path variable is passed to apiClient.post/get.
  for (let p = root.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      const index = p.arguments.findIndex((arg) => contains(arg, root));
      const method = nameOf(p.expression);
      if (index === 0 && API_METHODS.has(method)) return true;
      if (index === 0 && ts.isIdentifier(p.expression) && API_METHODS.has(method) && /features\/admin/.test(file)) return true;
      if (TEST_API_ASSERTIONS.has(method) && ts.isPropertyAccessExpression(p.expression)) {
        const receiver = p.expression.expression;
        if (ts.isCallExpression(receiver) && nameOf(receiver.expression) === 'expect') {
          const target = receiver.arguments[0];
          if (target) {
            let found = false;
            const visit = (n) => {
              if (ts.isPropertyAccessExpression(n) && API_METHODS.has(n.name.text) && /apiClient|client/i.test(n.expression.getText())) found = true;
              if (ts.isIdentifier(n) && API_METHODS.has(n.text) && /const\s+(get|post|put|patch|delete)\s*=\s*vi\.fn/.test(sourceText)) found = true;
              ts.forEachChild(n, visit);
            };
            visit(target);
            if (found) return true;
          }
        }
      }
    }
    if (ts.isSourceFile(p)) break;
  }
  return false;
}
function isPageContext(root, file) {
  const isTest = /(?:\.test\.|\.spec\.)/.test(file);
  if (/features\/admin\/nav(?:\.test)?\.ts$/.test(file)) return true;
  if (/features\/admin\/(?:AdminApp|AdminLayout)\.tsx$/.test(file)) return true;
  if (/components\/admin\/DataTable\.test\.tsx$/.test(file)) return true;
  if (/features\/admin\/mail\/mail-contract\.test\.ts$/.test(file)) return true;
  if (/features\/admin\/auth\/LoginPage\.tsx$/.test(file)) return true;
  if (/features\/admin\/jobs\/JobsPage\.tsx$/.test(file) && root.getText().startsWith('`/admin') ) return true;
  if (/features\/admin\/mail\/useMailPush\.ts$/.test(file)) {
    for (let p = root.parent; p; p = p.parent) {
      if (ts.isCallExpression(p) && ['register', 'getRegistration'].includes(nameOf(p.expression)) && p.arguments.some((arg) => contains(arg, root))) return true;
    }
  }
  if (/lib\/normalizeAdminUrl\.test\.ts$|LegacyAdminRedirect\.test\.tsx$/.test(file)) return false; // Legacy URL fixtures are intentionally retained for compatibility testing.
  if (/features\/admin\/(?:auth\/SetPasswordPage|enquiries\/EnquiriesPage|jobs\/JobsPage)\.test\.tsx$/.test(file)) return true; // MemoryRouter URL fixtures/route patterns.
  const sourceText = root.getSourceFile().text;
  for (let p = root.parent; p; p = p.parent) {
    if (ts.isJsxAttribute(p)) {
      const attr = p.name.getText().replace(/['"]/g, '');
      if (['to', 'href', 'from', 'path', 'initialEntries', 'getRowHref'].includes(attr)) return true;
    }
    if (ts.isCallExpression(p)) {
      const method = nameOf(p.expression);
      if (PAGE_CALLS.has(method) || method === 'scopesFor') return true;
      if (/features\/admin/.test(file) && method === 'setup' && /MemoryRouter|initialEntries|window\.history|useLocation/.test(sourceText)) return true;
      if (isTest && method === 'toHaveAttribute' && p.arguments.length >= 2 && ts.isStringLiteral(p.arguments[0]) && ['href', 'to'].includes(p.arguments[0].text)) return true;
      if (isTest && method === 'initialEntries') return true;
      if (isTest && method.startsWith('toHaveURL')) return true;
      if (isTest && TEST_API_ASSERTIONS.has(method) && p.expression && ts.isPropertyAccessExpression(p.expression)) {
        const receiver = p.expression.expression;
        if (ts.isCallExpression(receiver) && nameOf(receiver.expression) === 'expect') {
          const target = receiver.arguments[0];
          if (target && (nameOf(target) === 'navigate' || nameOf(target) === 'redirect' || /page/.test(target.getText()))) return true;
        }
      }
    }
    if (ts.isPropertyAssignment(p) && (nameOf(p.name) === 'path' || nameOf(p.name) === 'to' || nameOf(p.name) === 'href' || nameOf(p.name) === 'getRowHref')) {
      if (/nav\.ts$|AdminApp\.tsx$|routes\.tsx$|screens\.tsx$/.test(file) || isTest) return true;
    }
    if (ts.isPropertyAssignment(p) && p.name === root && /screens\.tsx$/.test(file)) return true;
    if (ts.isSourceFile(p)) break;
  }
  return false;
}
function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateHead(node)) return node.text;
  return '';
}

export function classifyFile(file) {
  const content = readFileSync(file, 'utf8');
  const sourceText = content;
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, kind);
  const hits = [];
  const flags = [];
  const addLiteral = (node) => {
    const text = literalText(node);
    if (!PREFIX_RE.test(text)) return;
    const root = expressionRoot(node);
    let classification = isApiArgument(root, file, sourceText) ? 'API' : isPageContext(root, file) ? 'PAGE' : 'AMBIGUOUS';
    const start = node.getStart(source);
    const line = source.getLineAndCharacterOfPosition(start).line + 1;
    const statement = source.text.split(/\r?\n/)[line - 1]?.trim() ?? '';
    hits.push({ file, line, start: node.getStart(source), end: node.getEnd(), classification, literal: text, reason: classification === 'API' ? 'API client method/wrapper first argument, API endpoint map, or API-client mock assertion' : classification === 'PAGE' ? 'Browser navigation, link, route, nav config, or page URL assertion' : /(?:normalizeAdminUrl\.test\.ts|LegacyAdminRedirect\.test\.tsx)$/.test(file) ? 'Legacy `/admin` input fixture intentionally retained to test backward-compatible URL normalisation and router redirects' : 'No unambiguous API or page-route AST context; default unchanged as API' , statement });
  };
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)) addLiteral(node);
    if (ts.isRegularExpressionLiteral(node) && /admin/i.test(node.text)) {
      const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
      flags.push({ file, line: pos.line + 1, form: 'RegExp literal', text: node.text });
    }
    if (ts.isNewExpression(node) && nameOf(node.expression) === 'RegExp' && node.arguments?.some((arg) => /admin/i.test(arg.getText(source)))) {
      const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
      flags.push({ file, line: pos.line + 1, form: 'new RegExp', text: node.getText(source) });
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const arg = node.arguments[0];
      if (['startsWith', 'replace', 'endsWith'].includes(method) && arg && /admin/i.test(arg.getText(source))) {
        const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
        flags.push({ file, line: pos.line + 1, form: `pathname ${method}`, text: node.getText(source) });
      }
      if (method === 'split' && arg && arg.getText(source).includes("'/'") && /pathname|location/i.test(node.expression.expression.getText(source))) {
        const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
        flags.push({ file, line: pos.line + 1, form: 'pathname split index logic', text: node.getText(source) });
      }
      if (['matchPath', 'useMatch', 'basename'].includes(method)) {
        const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
        flags.push({ file, line: pos.line + 1, form: method, text: node.getText(source) });
      }
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = node.left.getText(source); const right = node.right.getText(source);
      if ((left === "'/'" || left === '"/"') && /admin/.test(right) || (right === "'admin'" || right === '"admin"') && (left === "'/'" || left === '"/"')) {
        const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
        flags.push({ file, line: pos.line + 1, form: 'string concatenation building /admin', text: node.getText(source) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { hits, flags };
}

export function classifyTree(adminSrc) {
  const files = allFiles(adminSrc);
  const hits = [];
  const flags = [];
  for (const file of files) {
    const result = classifyFile(file);
    hits.push(...result.hits);
    flags.push(...result.flags);
  }
  return { files, hits, flags };
}
