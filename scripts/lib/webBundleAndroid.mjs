/**
 * Installs the shared native plugins (WebBundle for website updates, NativeUpdater for full APK updates)
 * into a generated Capacitor Android project and registers them. The Capacitor 7 template is Java-only
 * (no Kotlin plugin) and local plugins are not auto-discovered, so we write MainActivity.java ourselves.
 * Idempotent.
 */
import fs from 'node:fs';
import path from 'node:path';

const PLUGINS = ['WebBundlePlugin', 'NativeUpdaterPlugin'];
// Nurse app only: foreground stopwatch notification and work-time location samples for the visit audit.
const TRACKER_PLUGIN = 'VisitTrackerPlugin';
const TRACKER_SERVICE = 'VisitTrackerService';
const TRACKER_SERVICE_XML = `<service android:name=".${TRACKER_SERVICE}" android:exported="false" android:foregroundServiceType="location" />`;

/** Declares the tracker service inside <application>. Idempotent. */
export function addTrackerService(manifest) {
  if (manifest.includes(`.${TRACKER_SERVICE}`)) return manifest;
  if (!/<\/application>/.test(manifest)) throw new Error('Generated AndroidManifest.xml has no closing </application>.');
  return manifest.replace(/<\/application>/, `    ${TRACKER_SERVICE_XML}\n    </application>`);
}

export const UPDATE_FILE_PATHS = `<?xml version="1.0" encoding="utf-8"?>
<paths>
  <cache-path name="apk-updates" path="apk-update/" />
</paths>
`;

export function installNativePlugins({ mainDir, appId, sharedDir, visitTracker = false }) {
  const pkgDir = path.join(mainDir, 'java', ...appId.split('.'));
  fs.mkdirSync(pkgDir, { recursive: true });
  const plugins = visitTracker ? [...PLUGINS, TRACKER_PLUGIN] : PLUGINS;
  const files = visitTracker ? [...plugins, TRACKER_SERVICE] : plugins;
  for (const name of files) {
    const source = fs.readFileSync(path.join(sharedDir, `${name}.java`), 'utf8').replaceAll('__PACKAGE__', appId);
    fs.writeFileSync(path.join(pkgDir, `${name}.java`), source);
  }

  const activity = path.join(pkgDir, 'MainActivity.java');
  if (fs.existsSync(activity) && !/extends\s+BridgeActivity/.test(fs.readFileSync(activity, 'utf8'))) {
    throw new Error(`${activity} does not extend BridgeActivity; refusing to overwrite it.`);
  }
  const registrations = plugins.map((name) => `        registerPlugin(${name}.class);`).join('\n');
  fs.writeFileSync(
    activity,
    `package ${appId};

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
${registrations}
        super.onCreate(savedInstanceState);
    }
}
`,
  );
  if (visitTracker) {
    const manifestPath = path.join(mainDir, 'AndroidManifest.xml');
    fs.writeFileSync(manifestPath, addTrackerService(fs.readFileSync(manifestPath, 'utf8')));
  }
  return { pkgDir, activity };
}
