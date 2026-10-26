import type { FieldProfile } from '../app/useFieldProfile';
import type { CachedVisit } from '../offline/db';
import { UpdateNotice } from '../features/update/UpdateNotice';
import { copy } from '../copy';

type InboxItem = { id: string; title: string; body: string; created_at?: string };
type VersionInfo = { latest: string; min_supported: string; download_path?: string | null };
type Props = {
  profile: FieldProfile | null; appVersion: string; versionInfo: VersionInfo | null; remindersEnabled: boolean;
  inboxEnabled: boolean; inbox: InboxItem[]; inboxMessage: string; visits: CachedVisit[]; busy: boolean;
  onSync: () => void; onEnableReminders: () => void; onDisableReminders: () => void; onCheckUpdate: () => void; onLogout: () => void;
};
export function ProfileScreen(props: Props) {
  return <section className="screen" aria-labelledby="profile-heading"><div className="screen-heading"><div><p className="eyebrow">{copy.profile.eyebrow}</p><h2 id="profile-heading">{copy.profile.title}</h2></div></div>
    <section className="panel"><h3>{copy.profile.account}</h3><p>{copy.profile.accountRef} {props.profile?.user_id ?? copy.profile.unavailable}</p><p>{copy.profile.staffNumber} {props.profile?.staff_number ?? copy.profile.notSupplied}</p><p>{copy.profile.platform} {typeof navigator === 'undefined' ? copy.profile.unknown : /Android/i.test(navigator.userAgent) ? copy.profile.android : /iPhone|iPad/i.test(navigator.userAgent) ? copy.profile.ios : copy.profile.web}</p><p>{copy.profile.appVersion} {props.appVersion}</p>{props.profile?.team_id && <p>{copy.profile.teamRef} {props.profile.team_id}</p>}</section>
    {props.versionInfo && <section className="panel"><h3>{copy.profile.updates}</h3><UpdateNotice currentVersion={props.appVersion} latestVersion={props.versionInfo.latest} minimumVersion={props.versionInfo.min_supported} downloadPath={props.versionInfo.download_path} /><button type="button" className="button-secondary" onClick={props.onCheckUpdate}>{copy.profile.checkUpdate}</button></section>}
    <section className="panel"><h3>{copy.profile.reminders}</h3><p>{copy.profile.reminderPrivacy}</p>{props.remindersEnabled ? <button type="button" className="button-secondary" onClick={props.onDisableReminders}>{copy.profile.disableReminders}</button> : <button type="button" onClick={props.onEnableReminders}>{copy.profile.enableReminders}</button>}</section>
    <section className="panel"><h3>{copy.profile.privacy}</h3><p>{copy.profile.locationPrivacy}</p><p>{copy.profile.notePrivacy}</p></section>
    <section className="panel"><div className="screen-heading"><h3>{copy.profile.inbox}</h3><span className="status-chip">{props.inboxEnabled ? copy.profile.inboxEnabled : copy.profile.notConfigured}</span></div>{!props.inboxEnabled ? <p>{copy.profile.inboxUnavailable}</p> : props.inboxMessage ? <p role="status">{props.inboxMessage}</p> : props.inbox.length === 0 ? <p>{copy.profile.noNotifications}</p> : props.inbox.map((item) => <article className="inbox-item" key={item.id}><h4>{item.title}</h4><p>{item.body}</p>{item.created_at && <small>{item.created_at}</small>}</article>)}</section>
    <section className="panel"><h3>{copy.profile.savedWork}</h3><p>{props.visits.filter((visit) => visit.status === 'in_progress').length} {copy.profile.activeCached}</p><button type="button" className="button-secondary" onClick={props.onSync} disabled={props.busy}>{props.busy ? copy.today.syncing : copy.profile.syncNow}</button></section>
    <section className="panel"><h3>{copy.profile.signOutHeading}</h3><p>{copy.profile.signOutHint}</p><button type="button" className="button-danger" onClick={props.onLogout}>{copy.profile.signOut}</button></section>
  </section>;
}
