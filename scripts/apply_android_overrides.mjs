#!/usr/bin/env node
/**
 * Applies the nurse app's Android overrides to the project that `npx cap add android` generates.
 *
 * The files in nurse/android-overrides are fragments, not whole replacements:
 *   - AndroidManifest.xml lists permissions and <application> attributes to merge in.
 *   - network_security_config.xml is copied to res/xml.
 * This script also stamps versionCode/versionName into app/build.gradle and writes the
 * notification small icon that capacitor.config.ts refers to (ic_stat_nest).
 *
 * It is idempotent: running it twice leaves the project unchanged the second time.
 * No dependencies beyond Node.
 *
 * CLI: node scripts/apply_android_overrides.mjs
 *   NURSE_VERSION_CODE  integer, defaults to GITHUB_RUN_NUMBER, then 1
 *   (versionName comes from nurse/package.json)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NOTIFICATION_ICON = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M12,4.5m-3,0a3,3 0,1 1,6 0a3,3 0,1 1,-6 0" />
    <path
        android:strokeColor="#FFFFFFFF"
        android:strokeWidth="1.8"
        android:strokeLineCap="round"
        android:pathData="M4,12C6,21 18,21 20,12" />
</vector>
`;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readOverrideManifest(xml) {
  const permissions = [...xml.matchAll(/<uses-permission\s+android:name="([^"]+)"\s*\/>/g)].map((m) => m[1]);
  const applicationTag = xml.match(/<application\b([^>]*?)\/?>/s);
  const attributes = {};
  if (applicationTag) {
    for (const m of applicationTag[1].matchAll(/(android:[A-Za-z]+)="([^"]*)"/g)) attributes[m[1]] = m[2];
  }
  return { permissions, attributes };
}

export function mergeManifest(generated, override) {
  const { permissions, attributes } = readOverrideManifest(override);
  let result = generated;

  const applicationMatch = result.match(/<application\b[^>]*>/s);
  if (!applicationMatch) throw new Error('Generated AndroidManifest.xml has no <application> element.');
  let tag = applicationMatch[0];
  const wanted = { ...attributes, 'android:networkSecurityConfig': '@xml/network_security_config' };
  for (const [name, value] of Object.entries(wanted)) {
    const existing = new RegExp(`${escapeRegExp(name)}="[^"]*"`);
    tag = existing.test(tag)
      ? tag.replace(existing, `${name}="${value}"`)
      : tag.replace(/<application\b/, `<application\n        ${name}="${value}"`);
  }
  result = result.replace(applicationMatch[0], tag);

  const missing = permissions.filter((name) => !new RegExp(`android:name="${escapeRegExp(name)}"`).test(result));
  if (missing.length > 0) {
    const lines = missing.map((name) => `    <uses-permission android:name="${name}" />`).join('\n');
    if (!/<\/manifest>/.test(result)) throw new Error('Generated AndroidManifest.xml has no closing </manifest>.');
    result = result.replace(/<\/manifest>/, `${lines}\n</manifest>`);
  }
  return result;
}

export function patchGradleVersion(gradle, versionCode, versionName) {
  if (!/versionCode\s+\d+/.test(gradle) || !/versionName\s+"[^"]*"/.test(gradle)) {
    throw new Error('app/build.gradle does not contain versionCode and versionName in the expected form.');
  }
  return gradle
    .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
}

export function applyAndroidOverrides({ androidDir, overridesDir, versionCode, versionName }) {
  if (!Number.isInteger(versionCode) || versionCode < 1) {
    throw new Error(`versionCode must be a positive integer, got ${versionCode}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(versionName)) {
    throw new Error(`versionName must look like 1.2.3, got ${versionName}`);
  }
  const main = path.join(androidDir, 'app', 'src', 'main');
  const manifestPath = path.join(main, 'AndroidManifest.xml');
  const gradlePath = path.join(androidDir, 'app', 'build.gradle');
  for (const file of [manifestPath, gradlePath]) {
    if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Run "npx cap add android" first.`);
  }
  const overrideManifest = path.join(overridesDir, 'AndroidManifest.xml');
  const networkConfig = path.join(overridesDir, 'network_security_config.xml');
  for (const file of [overrideManifest, networkConfig]) {
    if (!fs.existsSync(file)) throw new Error(`Missing override file ${file}`);
  }

  fs.writeFileSync(
    manifestPath,
    mergeManifest(fs.readFileSync(manifestPath, 'utf8'), fs.readFileSync(overrideManifest, 'utf8')),
  );
  fs.mkdirSync(path.join(main, 'res', 'xml'), { recursive: true });
  fs.copyFileSync(networkConfig, path.join(main, 'res', 'xml', 'network_security_config.xml'));
  fs.mkdirSync(path.join(main, 'res', 'drawable'), { recursive: true });
  fs.writeFileSync(path.join(main, 'res', 'drawable', 'ic_stat_nest.xml'), NOTIFICATION_ICON);
  fs.writeFileSync(gradlePath, patchGradleVersion(fs.readFileSync(gradlePath, 'utf8'), versionCode, versionName));

  return { manifestPath, gradlePath, versionCode, versionName };
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const nurse = path.join(repoRoot, 'nurse');
  const pkg = JSON.parse(fs.readFileSync(path.join(nurse, 'package.json'), 'utf8'));
  const versionCode = Number(process.env.NURSE_VERSION_CODE ?? process.env.GITHUB_RUN_NUMBER ?? 1);
  const result = applyAndroidOverrides({
    androidDir: path.join(nurse, 'android'),
    overridesDir: path.join(nurse, 'android-overrides'),
    versionCode,
    versionName: pkg.version,
  });
  console.log(`Applied Android overrides: versionCode ${result.versionCode}, versionName ${result.versionName}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
