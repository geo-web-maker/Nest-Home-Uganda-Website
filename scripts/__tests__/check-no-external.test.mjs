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
