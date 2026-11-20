import { useMemo } from 'react';
import { Button } from '@shared/components/ui/Button';
import { NativeUpdater } from '../../admin-native/nativeUpdater';
import { WebBundle } from '../../admin-native/webBundle';
import { formatSize, useAppCenter, type AppCenterPlugins } from '../../admin-native/appCenter';

const CHANNEL_LABEL = { native: 'Android app', pwa: 'Installed web app', browser: 'Web browser' } as const;

/** The small in-app store for the admin app: what is installed, what is newer, one button to get it. */
export function AppCenterPanel() {
  const plugins = useMemo<AppCenterPlugins>(() => ({ nativeUpdater: NativeUpdater, webBundle: WebBundle }), []);
  const { channel, installed, apk, apkIsNewer, bundle, pwa, phase, checkedAt, check, installApk, installBundle, updatePwa } = useAppCenter('admin', plugins);
  const busy = phase.kind === 'checking' || phase.kind === 'downloading' || phase.kind === 'installing';
  const nothingNew = channel === 'native' ? !apkIsNewer && !bundle : !pwa.updateReady;

  return <article className="care-form" aria-labelledby="app-center-title">
    <h2 id="app-center-title">App Center</h2>
    <dl className="nurse-facts">
      <div><dt>Running as</dt><dd>{CHANNEL_LABEL[channel]}</dd></div>
      <div><dt>App version</dt><dd>{installed.nativeVersion ?? installed.webVersion}</dd></div>
      {channel === 'native' && <div><dt>Web content</dt><dd>{installed.runningBundle ?? installed.webVersion}</dd></div>}
      {channel === 'native' && installed.stagedBundle && <div><dt>Waiting for next launch</dt><dd>{installed.stagedBundle}</dd></div>}
      {checkedAt && <div><dt>Last checked</dt><dd>{checkedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</dd></div>}
    </dl>
    <p role="status">{phase.kind === 'checking' ? 'Checking for updates…' : nothingNew && phase.kind === 'idle' ? 'You have the latest version.' : ''}</p>
    {phase.kind === 'error' && <p role="alert">{phase.message}</p>}
    {phase.kind === 'downloading' && <p>{phase.what === 'apk' ? 'Downloading the app update' : 'Downloading the latest screens'}… {phase.pct}% <progress value={phase.pct} max={100} aria-label="Download progress" /></p>}
    {phase.kind === 'installing' && <p role="status">{channel === 'native' ? 'Opening the installer. Confirm on the next screen.' : 'Updating…'}</p>}

    {channel === 'native' && bundle && <div>
      <h3>Latest screens {bundle.version}</h3>
      <p>{bundle.release_notes || 'Improvements to the screens. No reinstall needed.'} {formatSize(bundle.size_bytes)}</p>
      <Button type="button" variant="forest" disabled={busy} onClick={() => void installBundle()}>Update now</Button>
    </div>}
    {channel === 'native' && apkIsNewer && apk && <div>
      <h3>App version {apk.version}</h3>
      <p>{apk.release_notes || 'A new version of the app is ready to install.'} {formatSize(apk.size_bytes)}. Android asks you to confirm the install.</p>
      <Button type="button" variant="forest" disabled={busy} onClick={() => void installApk()}>Download and install</Button>
    </div>}
    {channel !== 'native' && pwa.updateReady && <div>
      <h3>A new version is ready</h3>
      <p>The page reloads once.</p>
      <Button type="button" variant="forest" disabled={busy} onClick={() => void updatePwa()}>Update now</Button>
    </div>}
    {channel !== 'native' && apk && <div>
      <h3>Android app {apk.version}</h3>
      <p>Download the full app for an Android phone. Open the file afterwards and allow installs from this browser if Android asks. {formatSize(apk.size_bytes)}</p>
      <Button href={apk.url} variant="outline" rel="noopener">Download Android app</Button>
    </div>}
    <Button type="button" variant="outline" disabled={busy} onClick={() => void check()}>{phase.kind === 'checking' ? 'Checking…' : 'Check for updates'}</Button>
  </article>;
}
