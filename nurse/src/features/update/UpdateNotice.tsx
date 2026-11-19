import { isForcedUpdate, compareVersions } from '../../lib/version';
import { copy } from '../../copy';
import { Banner } from '../../ui/Banner';
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

  function renderDownloadButton() {
    if (state.status === 'error') {
      return (
        <div className="mk-update-actions">
          <span className="mk-update-error">{state.message}</span>
          <button className="mk-update-link" onClick={reset}>{copy.update.checkAgain}</button>
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
        <button
          className="mk-update-link"
          onClick={() => start(apkInfo)}
        >
          {copy.update.getSupported}
        </button>
      );
    }
    if (downloadPath) {
      return <a className="mk-update-link" href={downloadPath}>{copy.update.getSupported}</a>;
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
        {renderDownloadButton()}
      </div>
    );
  }

  return (
    <div className="mk-update-notice">
      <Banner tone="info">
        {copy.update.newerAvailable} ({latestVersion}) {copy.update.available}{' '}
        {copy.update.installedVersion} {currentVersion}.
      </Banner>
      {renderDownloadButton()}
    </div>
  );
}
