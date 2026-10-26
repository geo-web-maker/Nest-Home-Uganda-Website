import { isForcedUpdate, compareVersions } from '../../lib/version';
import { copy } from '../../copy';

type Props = { currentVersion: string; minimumVersion: string; latestVersion?: string; downloadPath?: string | null };
export function UpdateNotice({ currentVersion, minimumVersion, latestVersion = minimumVersion, downloadPath }: Props) {
  const blocked = isForcedUpdate(currentVersion, minimumVersion);
  const updateAvailable = compareVersions(currentVersion, latestVersion) < 0;
  if (blocked) return <div className="update-notice update-notice--blocking" role="alert"><h3>{copy.update.required}</h3><p>{copy.update.belowMinimum}</p><p>{copy.update.installed} {currentVersion} · {copy.update.minimum} {minimumVersion}</p>{downloadPath ? <a href={downloadPath}>{copy.update.getSupported}</a> : <p>{copy.update.contactSupervisor}</p>}</div>;
  if (updateAvailable) return <div className="update-notice" role="status"><p>{copy.update.newerAvailable} ({latestVersion}) {copy.update.available} {copy.update.installedVersion} {currentVersion}.</p>{downloadPath && <a href={downloadPath}>{copy.update.view}</a>}</div>;
  return <p role="status">{copy.update.upToDate} ({currentVersion}).</p>;
}
