import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('external URL guard script exists and checks a target directory', () => {
  const script = path.resolve('scripts/check-no-external.mjs');
  assert.equal(fs.existsSync(script), true);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'external-check-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<p>clean</p>');
  const result = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
});

test('an allowlisted host followed by a semicolon (CSP header) is not reported', () => {
  const script = path.resolve('scripts/check-no-external.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'external-check-'));
  fs.writeFileSync(path.join(dir, '_headers'), "/*\\n  Content-Security-Policy: connect-src 'self' https://api.cloudinary.com; frame-ancestors 'none'\\n");
  const ok = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  fs.writeFileSync(path.join(dir, '_headers'), "connect-src https://evil.example.com; x");
  const bad = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /evil\.example\.com/);
});
