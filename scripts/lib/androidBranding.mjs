/**
 * Copies the app's launcher icons, adaptive-icon background and splash drawable into a generated
 * Capacitor Android project, replacing the default Capacitor artwork. Idempotent.
 * Source files: android-shared/branding/<nurse|admin>/res (generated from the brand mark; see docs/ANDROID_RELEASE_GUIDE.md).
 */
import fs from 'node:fs';
import path from 'node:path';

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else fs.copyFileSync(source, target);
  }
}

function removeDefaultSplashPngs(resDir) {
  for (const entry of fs.readdirSync(resDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^drawable/.test(entry.name)) continue;
    const dir = path.join(resDir, entry.name);
    for (const file of fs.readdirSync(dir)) if (file === 'splash.png') fs.rmSync(path.join(dir, file));
  }
}

export function applyBranding({ mainDir, sharedDir, app }) {
  const source = path.join(sharedDir, 'branding', app, 'res');
  if (!fs.existsSync(source)) throw new Error(`Missing branding resources: ${source}`);
  const resDir = path.join(mainDir, 'res');
  fs.mkdirSync(resDir, { recursive: true });
  removeDefaultSplashPngs(resDir); // splash.xml replaces the default Capacitor splash images
  copyTree(source, resDir);
  return { resDir };
}
