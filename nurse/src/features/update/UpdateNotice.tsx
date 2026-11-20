import { isForcedUpdate, compareVersions } from '../../lib/version';
import { copy } from '../../copy';
import { Banner } from '../../ui/Banner';
import { PillButton } from '../../ui/PillButton';
import { useNativeUpdate } from './useNativeUpdate';

type ApkInfo = { url: string; sha256?: string | null; version: string };

type Props = {
  currentVersion: string;
  minimumVersion: string;
  latestVersion?: string;
  downloadPath?: string | null;
  apkInfo?: ApkInfo | null;    // set by caller after fetching /field/app/apk
};

export function UpdateNotice({
  currentVersion,
  minimumVersion,
  latestVersion = minimumVersion,
  downloadPath,
  apkInfo,
}: Props) {
  const blocked = isForcedUpdate(currentVersion, minimumVersion);
  const updateAvailable = compareVersions(currentVersion, latestVersion) < 0;
  const { state, start, reset, isNative } = useNativeUpdate();

  if (!blocked && !updateAvailable) {
    return <Banner tone="ok">{copy.update.upToDate} ({currentVersion}).</Banner>;
  }

  function renderDownloadButton(label: string) {
    if (state.status === 'error') {
      return (
        <div className="mk-update-actions">
          <span className="mk-update-error">{state.message}</span>
          <PillButton tone="ghost" size="sm" showArrow={false} onClick={reset}>{copy.update.checkAgain}</PillButton>
        </div>
      );
    }
    if (state.status === 'installing') {
      return <p className="mk-update-status">{copy.update.installing ?? 'Installing…'}</p>;
    }
    if (state.status === 'downloading') {
      return (
        <div className="mk-update-progress">
          <progress value={state.pct} max={100} />
          <span>{state.pct}%</span>
        </div>
      );
    }
    // idle — show the best available action
    if (isNative && apkInfo) {
      return (
        <PillButton tone="forest" size="sm" showArrow={false} onClick={() => void start(apkInfo)}>{label}</PillButton>
      );
    }
    if (downloadPath) {
      return <a className="mk-update-link" href={downloadPath}>{label}</a>;
    }
    return <p>{copy.update.contactSupervisor}</p>;
  }

  if (blocked) {
    return (
      <div className="mk-update-notice mk-update-notice--blocking">
        <Banner tone="bad" role="alert">
          <strong>{copy.update.required}</strong> {copy.update.belowMinimum}{' '}
          {copy.update.installed} {currentVersion} · {copy.update.minimum} {minimumVersion}
        </Banner>
        {renderDownloadButton(copy.update.getSupported)}
      </div>
    );
  }

  return (
    <div className="mk-update-notice">
      <Banner tone="info">
        {copy.update.newerAvailable} ({latestVersion}) {copy.update.available}{' '}
        {copy.update.installedVersion} {currentVersion}.
      </Banner>
      {renderDownloadButton(copy.update.view)}
    </div>
  );
}
