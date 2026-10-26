import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('string guard rejects emoji-like code points', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'string-check-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<p>ok</p>');
  const clean = spawnSync(process.execPath, [path.resolve('scripts/check-strings.mjs'), dir], { encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stderr);
  fs.writeFileSync(path.join(dir, 'index.html'), '<p>🌿</p>');
  const bad = spawnSync(process.execPath, [path.resolve('scripts/check-strings.mjs'), dir], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.notEqual(bad.status, 0);
});
