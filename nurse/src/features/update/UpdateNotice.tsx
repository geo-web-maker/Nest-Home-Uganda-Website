import { isForcedUpdate, compareVersions } from '../../lib/version';
import { copy } from '../../copy';
import { Banner } from '../../ui/Banner';
import { PillButton } from '../../ui/PillButton';
import { PillLink } from '../../ui/PillLink';
import { useNativeUpdate } from './useNativeUpdate';

type ApkInfo = { url: string; sha256?: string | null; version: string };

type Props = {
  currentVersion: string;
  minimumVersion: string;
  latestVersion?: string | null;
  downloadPath?: string | null;
  apkInfo?: ApkInfo | null;    // set by caller after fetching /field/app/apk
  /** False when the server has not published any release records yet.
   *  Prevents a false "up to date" when both sides default to the same seed version. */
  hasReleases?: boolean;
};

export function UpdateNotice({
  currentVersion,
  minimumVersion,
  latestVersion,
  downloadPath,
  apkInfo,
  hasReleases = true,
}: Props) {
  const blocked = isForcedUpdate(currentVersion, minimumVersion);
  // latestVersion is null when the server has no release rows yet.
  const resolvedLatest = latestVersion ?? minimumVersion;
  const updateAvailable = compareVersions(currentVersion, resolvedLatest) < 0;
  const { state, start, reset, isNative } = useNativeUpdate();

  if (!blocked && !updateAvailable) {
    if (!hasReleases) {
      return (
        <Banner tone="info">
          {copy.update.noPolicyYet ?? 'No version policy published yet.'}{' '}
          <span style={{ opacity: 0.7 }}>({copy.update.installed} {currentVersion})</span>
        </Banner>
      );
    }
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
        <PillButton tone="gold" size="sm" showArrow={false} onClick={() => void start(apkInfo)}>{label}</PillButton>
      );
    }
    if (downloadPath) {
      return <PillLink tone="gold" href={downloadPath}>{label}</PillLink>;
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
        {copy.update.newerAvailable} ({resolvedLatest}) {copy.update.available}{' '}
        {copy.update.installedVersion} {currentVersion}.
      </Banner>
      {renderDownloadButton(copy.update.view)}
    </div>
  );
}
