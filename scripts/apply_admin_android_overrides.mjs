import fs from 'node:fs';
import path from 'node:path';
import { UPDATE_FILE_PATHS, installNativePlugins } from './lib/webBundleAndroid.mjs';
import { applyBranding } from './lib/androidBranding.mjs';

const androidDir = path.resolve('admin/android');
const main = path.join(androidDir, 'app', 'src', 'main');
const manifestPath = path.join(main, 'AndroidManifest.xml');
const gradlePath = path.join(androidDir, 'app', 'build.gradle');
for (const file of [manifestPath, gradlePath]) {
  if (!fs.existsSync(file)) throw new Error(`Admin Android file not found: ${file}`);
}

let manifest = fs.readFileSync(manifestPath, 'utf8');
for (const name of ['POST_NOTIFICATIONS', 'REQUEST_INSTALL_PACKAGES']) {
  if (!manifest.includes(`android.permission.${name}`)) {
    manifest = manifest.replace('<application', `  <uses-permission android:name="android.permission.${name}" />\n  <application`);
  }
}
manifest = manifest.replace('android:allowBackup="true"', 'android:allowBackup="false"');
if (!manifest.includes('android:usesCleartextTraffic=')) {
  manifest = manifest.replace('<application', '<application android:usesCleartextTraffic="false"');
}
// FileProvider so the system installer can read a downloaded APK (NativeUpdater).
if (!manifest.includes('.fileprovider')) {
  manifest = manifest.replace(
    '</application>',
    `  <provider
      android:name="androidx.core.content.FileProvider"
      android:authorities="\${applicationId}.fileprovider"
      android:exported="false"
      android:grantUriPermissions="true">
      <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/update_file_paths" />
    </provider>
  </application>`,
  );
}
fs.writeFileSync(manifestPath, manifest);

fs.mkdirSync(path.join(main, 'res', 'xml'), { recursive: true });
fs.writeFileSync(path.join(main, 'res', 'xml', 'update_file_paths.xml'), UPDATE_FILE_PATHS);

// Stamp the version so the APK updater can compare builds (ADMIN_VERSION_CODE, else CI run number, else 1).
const pkg = JSON.parse(fs.readFileSync(path.resolve('admin/package.json'), 'utf8'));
const versionCode = Number(process.env.ADMIN_VERSION_CODE ?? process.env.GITHUB_RUN_NUMBER ?? 1);
let gradle = fs.readFileSync(gradlePath, 'utf8');
if (!/versionCode\s+\d+/.test(gradle) || !/versionName\s+"[^"]*"/.test(gradle)) {
  throw new Error('app/build.gradle does not contain versionCode and versionName in the expected form.');
}
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`).replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}"`);
fs.writeFileSync(gradlePath, gradle);

installNativePlugins({
  mainDir: main,
  appId: process.env.CAP_APP_ID_ADMIN ?? 'ug.nesthomecare.admin',
  sharedDir: path.resolve('android-shared'),
});

applyBranding({ mainDir: main, sharedDir: path.resolve('android-shared'), app: 'admin' });
