import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../../admin/', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const TOOLING = new Set([
  '@capacitor/cli', '@capacitor/android', '@tiptap/pm', 'typescript', 'vite', 'eslint', '@eslint/js',
  'jsdom', '@testing-library/dom', '@testing-library/jest-dom', '@testing-library/react',
  '@testing-library/user-event', '@types/node', '@types/react', '@types/react-dom', 'vitest',
  '@playwright/test', 'vite-plugin-pwa', 'dexie', 'fake-indexeddb', '@axe-core/playwright',
  '@types/leaflet', 'globals', 'prettier', 'openapi-typescript', 'ajv',
]);

function sources(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'android', 'test-results', 'playwright-report'].includes(entry.name)) continue;
    const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) sources(file, output);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) output.push(fs.readFileSync(file, 'utf8'));
  }
  return output;
}

test('admin dependencies use exact pinned versions', () => {
  for (const [name, version] of Object.entries(deps)) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name} must be pinned exactly, found ${version}`);
  }
});

test('admin requires Node 22 or newer', () => {
  assert.equal(pkg.engines.node, '>=22');
});

test('admin runtime dependencies are imported or explicitly required tooling', () => {
  const text = sources(root).join('\n');
  const unused = Object.keys(deps).filter((name) => {
    if (TOOLING.has(name)) return false;
    return !(text.includes(`'${name}'`) || text.includes(`"${name}"`) || text.includes(`'${name}/`) || text.includes(`"${name}/`));
  });
  assert.deepEqual(unused, [], `unused dependencies: ${unused.join(', ')}`);
});

test('admin package-lock root metadata matches package.json', () => {
  const lock = JSON.parse(fs.readFileSync(new URL('package-lock.json', root), 'utf8'));
  assert.ok(lock.lockfileVersion >= 2);
  const top = lock.packages[''];
  assert.deepEqual(top.dependencies ?? {}, pkg.dependencies);
  assert.deepEqual(top.devDependencies ?? {}, pkg.devDependencies);
  for (const [name, version] of Object.entries(deps)) {
    assert.equal(lock.packages[`node_modules/${name}`]?.version, version, `${name} lock record`);
  }
});
