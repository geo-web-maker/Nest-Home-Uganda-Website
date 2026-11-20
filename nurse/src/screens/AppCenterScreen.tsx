import { useMemo } from 'react';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { Row } from '../ui/Row';
import { Banner } from '../ui/Banner';
import { PillButton } from '../ui/PillButton';
import { NativeUpdater } from '../plugins/NativeUpdater';
import { WebBundle } from '../platform/webBundle';
import { formatSize, useAppCenter, type AppCenterPlugins } from '../platform/appCenter';
import { useUpgradeRequired } from '../lib/useUpgradeRequired';
import { CLIENT_BUILD } from '../lib/clientBuild';

const CHANNEL_LABEL = { native: 'Android app', pwa: 'Installed web app', browser: 'Web browser' } as const;

/** The small in-app store: what is installed, what is newer, and one button to get it. */
export function AppCenterScreen() {
  const plugins = useMemo<AppCenterPlugins>(() => ({ nativeUpdater: NativeUpdater, webBundle: WebBundle }), []);
  const { channel, installed, apk, apkIsNewer, bundle, pwa, phase, checkedAt, check, installApk, installBundle, updatePwa } = useAppCenter('nurse', plugins);
  const busy = phase.kind === 'checking' || phase.kind === 'downloading' || phase.kind === 'installing';
  const upgradeRequired = useUpgradeRequired();
  const nothingNew = !upgradeRequired && (channel === 'native' ? !apkIsNewer && !bundle : !pwa.updateReady);

  return <section className="screen" aria-labelledby="appcenter-heading">
    <header className="screen-heading"><div><p className="eyebrow">APP CENTER</p><h2 id="appcenter-heading">Get and update the app</h2><p>See which version you have and install updates yourself.</p></div></header>

    <Card>
      <div className="mk-profile-section__heading"><h3>This device</h3><Chip kind={nothingNew && phase.kind !== 'error' ? 'ok' : 'rv'}>{nothingNew ? 'Up to date' : 'Update ready'}</Chip></div>
      <Row label="Running as" value={CHANNEL_LABEL[channel]} />
      <Row label="App version" value={installed.nativeVersion ?? installed.webVersion} />
      <Row label="Client build" value={String(CLIENT_BUILD)} />
      {channel === 'native' && <Row label="Web content" value={installed.runningBundle ?? installed.webVersion} />}
      {channel === 'native' && installed.stagedBundle && <Row label="Waiting for next launch" value={installed.stagedBundle} />}
      {checkedAt && <Row label="Last checked" value={checkedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} />}
      <PillButton tone="ghost" disabled={busy} onClick={() => void check()}>{phase.kind === 'checking' ? 'Checking…' : 'Check for updates'}</PillButton>
    </Card>

    {upgradeRequired && <Banner tone="bad" role="alert">The server needs a newer version of this app. Install the update below, then open the app again.</Banner>}
    {phase.kind === 'error' && <Banner tone="bad" role="alert">{phase.message}</Banner>}
    {phase.kind === 'downloading' && <Card><p>{phase.what === 'apk' ? 'Downloading the app update' : 'Downloading the latest screens'}… {phase.pct}%</p><progress value={phase.pct} max={100} aria-label="Download progress" /></Card>}
    {phase.kind === 'installing' && <Banner tone="info">{channel === 'native' ? 'Opening the installer. Confirm on the next screen. Saved work stays on this phone.' : 'Updating…'}</Banner>}

    {channel === 'native' && bundle && <Card>
      <div className="mk-profile-section__heading"><h3>Latest screens {bundle.version}</h3><Chip kind="new">Quick update</Chip></div>
      <p>{bundle.release_notes || 'Improvements to the screens. No reinstall needed.'}</p>
      <p className="mk-hint">{formatSize(bundle.size_bytes)}</p>
      <PillButton tone="forest" disabled={busy} onClick={() => void installBundle()}>Update now</PillButton>
    </Card>}

    {channel === 'native' && apkIsNewer && apk && <Card>
      <div className="mk-profile-section__heading"><h3>App version {apk.version}</h3><Chip kind="new">New app</Chip></div>
      <p>{apk.release_notes || 'A new version of the app is ready to install.'}</p>
      <p className="mk-hint">{formatSize(apk.size_bytes)} · Android will ask you to confirm the install.</p>
      <PillButton tone="forest" disabled={busy} onClick={() => void installApk()}>Download and install</PillButton>
    </Card>}

    {channel !== 'native' && pwa.updateReady && <Card>
      <div className="mk-profile-section__heading"><h3>A new version is ready</h3><Chip kind="new">Web update</Chip></div>
      <p>Saved work stays on this phone. The app reloads once.</p>
      <PillButton tone="forest" disabled={busy} onClick={() => void updatePwa()}>Update now</PillButton>
    </Card>}

    {channel !== 'native' && apk && <Card>
      <div className="mk-profile-section__heading"><h3>Android app</h3><Chip kind="pg">v{apk.version}</Chip></div>
      <p>Prefer a full app on your Android phone? Download it here. Open the file afterwards and allow installs from this browser if Android asks.</p>
      <p className="mk-hint">{formatSize(apk.size_bytes)}</p>
      <a className="mk-update-link" href={apk.url} rel="noopener">Download Android app</a>
    </Card>}

    {channel === 'browser' && <Card><h3>Install as an app</h3><p>On Android Chrome use the menu, then Install app. On iPhone use Share, then Add to Home Screen.</p></Card>}

    {nothingNew && phase.kind === 'idle' && <Banner tone="ok">You have the latest version.</Banner>}
  </section>;
}
