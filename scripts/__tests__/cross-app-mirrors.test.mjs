import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

const mirroredPairs = [
  [
    'nurse/src/platform/appSwitch.ts',
    'admin/src/admin-native/appSwitch.ts',
  ],
  [
    'nurse/src/platform/nativeAppSwitch.ts',
    'admin/src/admin-native/nativeAppSwitch.ts',
  ],
  [
    'nurse/src/platform/appCenter.ts',
    'admin/src/admin-native/appCenter.ts',
  ],
];

for (const [left, right] of mirroredPairs) {
  test(`${left} and ${right} stay byte-identical`, () => {
    assert.equal(
      fs.readFileSync(path.join(root, left), 'utf8'),
      fs.readFileSync(path.join(root, right), 'utf8'),
    );
  });
}
