import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-check-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'index-abc.js'), 'const app = "hello";');
  return dir;
}

test('bundle-size guard rejects a deliberately tiny limit', () => {
  const dir = fixture();
  const result = spawnSync(process.execPath, [path.resolve('scripts/check-bundle-size.mjs'), dir], { env: { ...process.env, MAX_GZIP_BYTES: '1' }, encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
});

test('nurse bundle guard rejects Leaflet in nurse output', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-check-nurse-'));
  const dist = path.join(root, 'nurse', 'dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'index-abc.js'), 'const x = "leaflet map";');
  const result = spawnSync(process.execPath, [path.resolve('scripts/check-bundle-size.mjs'), dist], { env: { ...process.env, MAX_GZIP_BYTES: '999999' }, encoding: 'utf8' });
  fs.rmSync(root, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
});
