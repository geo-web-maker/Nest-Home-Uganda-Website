import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../../nurse/', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };

// Declared on purpose even though no source file imports them yet. Each entry names the phase
// that will use it. Remove the entry when the phase lands. The test fails on stale entries.
const PLANNED = {
  '@byteowls/capacitor-sms': 'B13 SOS SMS fallback (opens the composer only)',
  '@capacitor/android': 'native project, used by the Capacitor CLI',
};
// Tooling that is run by name rather than imported.
const TOOLING = new Set([
  '@capacitor/cli', 'typescript', 'vite', 'eslint', '@eslint/js', 'jsdom', '@testing-library/dom',
  '@types/node', '@types/react', '@types/react-dom', 'vitest', '@playwright/test',
]);

function sources(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'android', 'test-results', 'playwright-report'].includes(entry.name)) continue;
    const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) sources(file, out);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) out.push(fs.readFileSync(file, 'utf8'));
  }
  return out;
}

test('every nurse dependency is an exact version', () => {
  for (const [name, version] of Object.entries(deps)) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name} must be pinned exactly, found ${version}`);
  }
});

test('the nurse app requires Node 22 or newer', () => {
  assert.equal(pkg.engines.node, '>=22');
});

test('no declared dependency is unused', () => {
  const text = sources(root).join('\n');
  const unused = Object.keys(deps).filter((name) => {
    if (TOOLING.has(name) || name in PLANNED) return false;
    return !(text.includes(`'${name}'`) || text.includes(`"${name}"`) || text.includes(`'${name}/`));
  });
  assert.deepEqual(unused, [], `unused dependencies: ${unused.join(', ')}`);
});

test('the planned-dependency list has no stale entries', () => {
  const text = sources(root).join('\n');
  for (const name of Object.keys(PLANNED)) {
    assert.ok(name in deps, `${name} is listed as planned but is not in package.json`);
    if (name === '@capacitor/android') continue;
    assert.ok(!(text.includes(`'${name}'`) || text.includes(`"${name}"`)), `${name} is now imported, so remove it from PLANNED`);
  }
});

test('removed packages stay removed', () => {
  for (const name of ['i18next', 'react-i18next', 'react-hook-form', 'zod', '@tanstack/react-query', '@capacitor/preferences']) {
    assert.ok(!(name in deps), `${name} was removed in A1; add it back only with the phase that uses it`);
  }
});

test('a committed lockfile matches package.json', { skip: !fs.existsSync(new URL('package-lock.json', root)) }, () => {
  const lock = JSON.parse(fs.readFileSync(new URL('package-lock.json', root), 'utf8'));
  assert.ok(lock.lockfileVersion >= 2);
  const top = lock.packages[''];
  assert.deepEqual(top.dependencies ?? {}, pkg.dependencies);
  assert.deepEqual(top.devDependencies ?? {}, pkg.devDependencies);
});
