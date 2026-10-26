import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = path.resolve('scripts/check-nurse-styles.mjs');

test('nurse style guard accepts token-driven CSS and rejects hard-coded colours', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nurse-styles-'));
  const clean = path.join(dir, 'clean.css');
  const bad = path.join(dir, 'bad.css');
  fs.writeFileSync(clean, "@import '../../design/tokens.css'; :root { color: var(--ink); } @media (prefers-reduced-motion: reduce) { * { transition: none; } }");
  assert.equal(spawnSync(process.execPath, [script, clean], { encoding: 'utf8' }).status, 0);
  fs.writeFileSync(bad, "@import '../../design/tokens.css'; :root { color: #123456; } @media (prefers-reduced-motion: reduce) { * { transition: none; } }");
  assert.notEqual(spawnSync(process.execPath, [script, bad], { encoding: 'utf8' }).status, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});
