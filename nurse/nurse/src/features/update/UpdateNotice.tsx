import { isForcedUpdate, compareVersions } from '../../lib/version';
import { copy } from '../../copy';
import { Banner } from '../../ui/Banner';

type Props = { currentVersion: string; minimumVersion: string; latestVersion?: string; downloadPath?: string | null };

export function UpdateNotice({ currentVersion, minimumVersion, latestVersion = minimumVersion, downloadPath }: Props) {
  const blocked = isForcedUpdate(currentVersion, minimumVersion);
  const updateAvailable = compareVersions(currentVersion, latestVersion) < 0;
  if (blocked) return <div className="mk-update-notice mk-update-notice--blocking">
    <Banner tone="bad" role="alert"><strong>{copy.update.required}</strong> {copy.update.belowMinimum} {copy.update.installed} {currentVersion} · {copy.update.minimum} {minimumVersion}</Banner>
    {downloadPath ? <a className="mk-update-link" href={downloadPath}>{copy.update.getSupported}</a> : <p>{copy.update.contactSupervisor}</p>}
  </div>;
  if (updateAvailable) return <div className="mk-update-notice">
    <Banner tone="info">{copy.update.newerAvailable} ({latestVersion}) {copy.update.available} {copy.update.installedVersion} {currentVersion}.</Banner>
    {downloadPath && <a className="mk-update-link" href={downloadPath}>{copy.update.view}</a>}
  </div>;
  return <Banner tone="ok">{copy.update.upToDate} ({currentVersion}).</Banner>;
}
