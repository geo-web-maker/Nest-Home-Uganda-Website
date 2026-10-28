import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve('frontend/android/app/src/main/AndroidManifest.xml');
if (!fs.existsSync(manifestPath)) {
  throw new Error(`Admin Android manifest not found: ${manifestPath}`);
}

let manifest = fs.readFileSync(manifestPath, 'utf8');
const permission = '  <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />';
if (!manifest.includes('android.permission.POST_NOTIFICATIONS')) {
  manifest = manifest.replace('<application', `${permission}\n  <application`);
}
manifest = manifest.replace('android:allowBackup="true"', 'android:allowBackup="false"');
if (!manifest.includes('android:usesCleartextTraffic=')) {
  manifest = manifest.replace('<application', '<application android:usesCleartextTraffic="false"');
}
fs.writeFileSync(manifestPath, manifest);
