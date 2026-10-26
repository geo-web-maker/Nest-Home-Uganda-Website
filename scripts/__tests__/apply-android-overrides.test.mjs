import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyAndroidOverrides, mergeManifest, patchGradleVersion } from '../apply_android_overrides.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const realOverrides = path.join(repoRoot, 'nurse', 'android-overrides');

const GENERATED_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">

        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>

    <!-- Permissions -->

    <uses-permission android:name="android.permission.INTERNET" />
</manifest>
`;

const GENERATED_GRADLE = `android {
    namespace "ug.nesthomecare.nurse"
    defaultConfig {
        applicationId "ug.nesthomecare.nurse"
        minSdkVersion rootProject.ext.minSdkVersion
        versionCode 1
        versionName "1.0"
    }
}
`;

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'android-overrides-'));
  const androidDir = path.join(dir, 'android');
  const main = path.join(androidDir, 'app', 'src', 'main');
  fs.mkdirSync(main, { recursive: true });
  fs.writeFileSync(path.join(main, 'AndroidManifest.xml'), GENERATED_MANIFEST);
  fs.writeFileSync(path.join(androidDir, 'app', 'build.gradle'), GENERATED_GRADLE);
  return { dir, androidDir, main, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const run = (androidDir, extra = {}) =>
  applyAndroidOverrides({ androidDir, overridesDir: realOverrides, versionCode: 42, versionName: '0.1.0', ...extra });

test('merges permissions once and keeps the generated activity', () => {
  const merged = mergeManifest(GENERATED_MANIFEST, fs.readFileSync(path.join(realOverrides, 'AndroidManifest.xml'), 'utf8'));
  assert.equal(merged.match(/android.permission.INTERNET/g).length, 1);
  for (const name of ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS']) {
    assert.equal(merged.match(new RegExp(`android.permission.${name}`, 'g')).length, 1, name);
  }
  assert.match(merged, /android:name="\.MainActivity"/);
  assert.match(merged, /android\.intent\.category\.LAUNCHER/);
});

test('hardens the application element', () => {
  const merged = mergeManifest(GENERATED_MANIFEST, fs.readFileSync(path.join(realOverrides, 'AndroidManifest.xml'), 'utf8'));
  assert.match(merged, /android:allowBackup="false"/);
  assert.doesNotMatch(merged, /android:allowBackup="true"/);
  assert.match(merged, /android:usesCleartextTraffic="false"/);
  assert.match(merged, /android:networkSecurityConfig="@xml\/network_security_config"/);
});

test('background location is never requested', () => {
  const overrides = fs.readFileSync(path.join(realOverrides, 'AndroidManifest.xml'), 'utf8');
  assert.doesNotMatch(overrides, /ACCESS_BACKGROUND_LOCATION/);
  assert.doesNotMatch(overrides, /FOREGROUND_SERVICE/);
});

test('copies the network config, writes the notification icon and stamps the version', () => {
  const f = fixture();
  try {
    run(f.androidDir);
    assert.ok(fs.existsSync(path.join(f.main, 'res', 'xml', 'network_security_config.xml')));
    assert.match(fs.readFileSync(path.join(f.main, 'res', 'drawable', 'ic_stat_nest.xml'), 'utf8'), /<vector/);
    const gradle = fs.readFileSync(path.join(f.androidDir, 'app', 'build.gradle'), 'utf8');
    assert.match(gradle, /versionCode 42/);
    assert.match(gradle, /versionName "0\.1\.0"/);
  } finally {
    f.cleanup();
  }
});

test('is idempotent', () => {
  const f = fixture();
  try {
    run(f.androidDir);
    const first = ['AndroidManifest.xml'].map((n) => fs.readFileSync(path.join(f.main, n), 'utf8'));
    const firstGradle = fs.readFileSync(path.join(f.androidDir, 'app', 'build.gradle'), 'utf8');
    run(f.androidDir);
    assert.equal(fs.readFileSync(path.join(f.main, 'AndroidManifest.xml'), 'utf8'), first[0]);
    assert.equal(fs.readFileSync(path.join(f.androidDir, 'app', 'build.gradle'), 'utf8'), firstGradle);
  } finally {
    f.cleanup();
  }
});

test('fails clearly when the native project has not been generated', () => {
  assert.throws(() => run(path.join(os.tmpdir(), 'no-such-android-dir')), /npx cap add android/);
});

test('rejects an invalid version code or name', () => {
  const f = fixture();
  try {
    assert.throws(() => run(f.androidDir, { versionCode: 0 }), /positive integer/);
    assert.throws(() => run(f.androidDir, { versionCode: 1.5 }), /positive integer/);
    assert.throws(() => run(f.androidDir, { versionName: 'latest' }), /versionName/);
  } finally {
    f.cleanup();
  }
});

test('fails when build.gradle has no version fields', () => {
  assert.throws(() => patchGradleVersion('android { }', 1, '1.0.0'), /versionCode and versionName/);
});

test('the notification icon referenced by capacitor.config.ts is the one this script writes', () => {
  const config = fs.readFileSync(path.join(repoRoot, 'nurse', 'capacitor.config.ts'), 'utf8');
  assert.match(config, /smallIcon: 'ic_stat_nest'/);
  assert.doesNotMatch(config, /bundledWebRuntime/);
});
