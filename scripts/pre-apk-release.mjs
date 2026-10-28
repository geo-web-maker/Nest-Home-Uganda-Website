#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const skipE2E = args.has('--skip-e2e');
const staticOnly = args.has('--static-only');
const backendOnly = args.has('--backend-only');
const webOnly = args.has('--web-only');

function run(label, command, cwd = root, extraEnv = {}) {
  console.log(`\n=== ${label} ===`);
  console.log(`$ ${command}`);
  const result = spawnSync(command, {
    cwd,
    env: { ...process.env, ...extraEnv },
    shell: true,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error(`\nFAILED: ${label}`);
    process.exit(result.status ?? 1);
  }
}

function assertFile(path, label = path) {
  if (!existsSync(join(root, path))) {
    console.error(`Missing required ${label}: ${path}`);
    process.exit(1);
  }
}

function packageScript(dir, script) {
  const pkg = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
  if (!pkg.scripts?.[script]) {
    console.error(`Missing ${dir}/package.json script: ${script}`);
    process.exit(1);
  }
}

console.log('Pre-APK Release Test Suite');
console.log('This gate tests the web/backend release candidate. It does NOT build APKs.');

assertFile('frontend/package.json', 'frontend package');
assertFile('nurse/package.json', 'nurse package');
assertFile('backend/pyproject.toml', 'backend project');
assertFile('docs/PRE_APK_RELEASE_TEST_SUITE.md', 'release-suite documentation');
assertFile('reference/nest-all-features-mockups.html', 'canonical UI reference');

const frontendScripts = ['typecheck', 'lint', 'test', 'build', 'test:reference', 'test:a11y', 'test:responsive', 'test:admin-native', 'build:admin-native', 'test:e2e:admin-native'];
const nurseScripts = ['typecheck', 'lint', 'test', 'build', 'test:reference', 'test:a11y', 'test:responsive'];
for (const script of frontendScripts) packageScript('frontend', script);
for (const script of nurseScripts) packageScript('nurse', script);

if (staticOnly) {
  console.log('\nSTATIC CHECK: PASS');
  process.exit(0);
}

if (!webOnly) {
  run('Backend tests', 'python -m pytest', join(root, 'backend'));
  run('Backend lint', 'ruff check app tests', join(root, 'backend'));
}

if (backendOnly) {
  console.log('\nBACKEND GATE: PASS');
  process.exit(0);
}

run('Frontend typecheck', 'npm run typecheck', join(root, 'frontend'));
run('Frontend lint', 'npm run lint', join(root, 'frontend'));
run('Frontend unit/component tests', 'npm run test', join(root, 'frontend'));
run('Frontend production build', 'npm run build', join(root, 'frontend'));
run('Admin-native identity/unit tests', 'npm run test:admin-native', join(root, 'frontend'));

if (!skipE2E) {
  run('Public/admin reference fidelity', 'npm run test:reference', join(root, 'frontend'));
  run('Public/admin accessibility', 'npm run test:a11y', join(root, 'frontend'));
  run('Public/admin responsive checks', 'npm run test:responsive', join(root, 'frontend'));
  // The browser checks serve ./dist-admin-native, which `npm run build` does not produce.
  run('Admin-native build', 'npm run build:admin-native', join(root, 'frontend'));
  run('Admin-native browser checks', 'npm run test:e2e:admin-native', join(root, 'frontend'));
  run('Frontend full browser E2E', 'npm run test:e2e', join(root, 'frontend'));
}

run('Nurse typecheck', 'npm run typecheck', join(root, 'nurse'));
run('Nurse lint', 'npm run lint', join(root, 'nurse'));
run('Nurse unit/component tests', 'npm run test', join(root, 'nurse'));
run('Nurse production build', 'npm run build', join(root, 'nurse'));

if (!skipE2E) {
  run('Nurse reference fidelity', 'npm run test:reference', join(root, 'nurse'));
  run('Nurse accessibility', 'npm run test:a11y', join(root, 'nurse'));
  run('Nurse responsive checks', 'npm run test:responsive', join(root, 'nurse'));
  run('Nurse browser E2E', 'npm run test:e2e', join(root, 'nurse'));
}

console.log('\n========================================');
console.log('PRE-APK RELEASE GATE: PASS');
console.log('No APK was created by this script.');
console.log('Proceed to native Android smoke testing only after reviewing the results.');
console.log('========================================');
