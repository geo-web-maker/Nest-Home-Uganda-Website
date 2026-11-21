import { ProfileCareSection } from '../features/careforms/ProfileCareSection';
import { Link } from 'react-router-dom';
import { useState, useCallback } from 'react';
import type { FieldProfile } from '../app/useFieldProfile';
import type { CachedVisit } from '../offline/db';
import { UpdateNotice } from '../features/update/UpdateNotice';
import { copy } from '../copy';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { Card } from '../ui/Card';
import { Avatar } from '../ui/Avatar';
import { Row } from '../ui/Row';
import { Icon } from '../ui/Icon';
import { PillButton } from '../ui/PillButton';
import { Chip } from '../ui/Chip';
import { initials } from '../ui/greeting';

type MailLogEntry = {
  id: string;
  recipient: string;
  subject: string;
  status: 'delivered' | 'failed' | 'pending' | string;
  sent_at: string;
  error?: string | null;
};

function MailLogsDisclosure() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<MailLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (logs.length > 0) return; // already fetched this session
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/field/mail/delivery-log?limit=20');
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as { items?: MailLogEntry[] };
      setLogs(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load logs.');
    } finally {
      setLoading(false);
    }
  }, [logs.length]);

  function handleToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    const isOpen = (e.currentTarget as HTMLDetailsElement).open;
    setOpen(isOpen);
    if (isOpen) void load();
  }

  const statusKind = (s: string): 'ok' | 'bad' | 'sc' =>
    s === 'delivered' ? 'ok' : s === 'failed' ? 'bad' : 'sc';

  return (
    <details className="mk-profile-disclosure mk-mail-logs" onToggle={handleToggle} open={open}>
      <summary className="mk-mail-logs__summary">
        <Icon name="mail" /><span>Mail delivery log</span>
      </summary>
      <div className="mk-mail-logs__body">
        {loading && <p className="mk-mail-logs__state">Loading…</p>}
        {error  && <p className="mk-mail-logs__state mk-mail-logs__state--err">{error}</p>}
        {!loading && !error && logs.length === 0 && <p className="mk-mail-logs__state">No delivery records.</p>}
        {logs.map((log) => (
          <div key={log.id} className="mk-mail-log-item">
            <div className="mk-mail-log-item__meta">
              <Chip kind={statusKind(log.status)}>{log.status}</Chip>
              <span className="mk-mail-log-item__to">{log.recipient}</span>
            </div>
            <p className="mk-mail-log-item__subject">{log.subject}</p>
            {log.error && <p className="mk-mail-log-item__err">{log.error}</p>}
            <time className="mk-mail-log-item__time" dateTime={log.sent_at}>
              {new Date(log.sent_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
            </time>
          </div>
        ))}
      </div>
    </details>
  );
}

type InboxItem = { id: string; title: string; body: string; created_at?: string };
type ApkInfo = { url: string; sha256?: string | null; version: string };
type VersionInfo = { latest: string | null; min_supported: string; has_releases?: boolean; download_path?: string | null; apk_info?: ApkInfo | null };
type Props = {
  profile: FieldProfile | null; appVersion: string; versionInfo: VersionInfo | null; remindersEnabled: boolean;
  sosEnabled?: boolean; inboxEnabled: boolean; inbox: InboxItem[]; inboxMessage: string; visits: CachedVisit[]; busy: boolean;
  onSync: () => void; onEnableReminders: () => void; onDisableReminders: () => void; onCheckUpdate: () => void; onLogout: () => void;
};

export function ProfileScreen(props: Props) {
  const platform = typeof navigator === 'undefined' ? copy.profile.unknown : /Android/i.test(navigator.userAgent) ? copy.profile.android : /iPhone|iPad/i.test(navigator.userAgent) ? copy.profile.ios : copy.profile.web;
  const name = props.profile?.display_name?.trim() || copy.profile.account;
  const activeVisits = props.visits.filter((visit) => visit.status === 'in_progress').length;
  return <section className="screen mk-profile-screen" aria-labelledby="profile-heading">
    <header className="screen-heading"><div><p className="eyebrow">{copy.profile.eyebrow}</p><h2 id="profile-heading">{copy.profile.title}</h2></div></header>
    <Card className="mk-profile-identity">
      <div className="mk-profile-identity__row"><Avatar initials={initials(props.profile?.display_name, props.profile?.staff_number)} label={props.profile?.display_name || undefined} /><div><h3>{name}</h3><p>{props.profile?.email || copy.profile.unavailable}</p>{props.profile?.supervisor_name && <small>{copy.profile.supervisor}: {props.profile.supervisor_name}</small>}</div></div>
      {props.profile?.staff_number && <span className="mk-profile-staff">{props.profile.staff_number}</span>}
    </Card>

    <nav className="mk-profile-shortcuts" aria-label={copy.profile.quickSettings}>
      <Link to="/sync"><Icon name="sync" /><span>{copy.profile.syncTitle}</span><Icon name="arrow-up-right" /></Link>
      <a href="#profile-permissions"><Icon name="user" /><span>{copy.profile.permissionsHelp}</span><Icon name="arrow-up-right" /></a>
      <Link to="/app-center"><Icon name="check" /><span>App Center</span><Icon name="arrow-up-right" /></Link>
      <a href="#profile-device"><Icon name="doc" /><span>{copy.profile.appVersion}: {props.appVersion}</span><Icon name="arrow-up-right" /></a>
    </nav>

    <Card className="mk-profile-section" id="profile-update">
      <h3>{copy.profile.updates}</h3>
      <Row label={copy.profile.appVersion} value={props.appVersion} />
      {props.versionInfo
        ? <UpdateNotice currentVersion={props.appVersion} latestVersion={props.versionInfo.latest} minimumVersion={props.versionInfo.min_supported} downloadPath={props.versionInfo.download_path} apkInfo={props.versionInfo.apk_info} hasReleases={props.versionInfo.has_releases ?? true} />
        : <UpdateNotice currentVersion={props.appVersion} latestVersion={null} minimumVersion="0.0.0" hasReleases={false} />
      }
      <PillButton tone="ghost" onClick={props.onCheckUpdate}>{copy.profile.checkUpdate}</PillButton>
    </Card>

    <details className="mk-profile-disclosure" id="profile-device">
      <summary>{copy.profile.deviceDetails}</summary>
      <div className="mk-profile-detail-list">
        <Row label={copy.profile.accountRef} value={props.profile?.user_id ?? copy.profile.unavailable} />
        <Row label={copy.profile.staffNumber} value={props.profile?.staff_number ?? copy.profile.notSupplied} />
        <Row label={copy.profile.platform} value={platform} />
        <Row label={copy.profile.appVersion} value={props.appVersion} />
        {props.profile?.team_id && <Row label={copy.profile.teamRef} value={props.profile.team_id} />}
      </div>
    </details>

    <Card className="mk-profile-section"><h3>{copy.profile.reminders}</h3><p>{copy.profile.reminderPrivacy}</p>
      {props.remindersEnabled ? <PillButton tone="ghost" onClick={props.onDisableReminders}>{copy.profile.disableReminders}</PillButton> : <PillButton onClick={props.onEnableReminders}>{copy.profile.enableReminders}</PillButton>}
    </Card>

    <Card className="mk-profile-section" id="profile-permissions">
      <h3>{copy.profile.privacy}</h3><p>{copy.profile.locationPrivacy}</p><p>{copy.profile.notePrivacy}</p>
      <details className="device-help mk-profile-disclosure"><summary>{copy.profile.permissionsHelp}</summary>
        <div className="device-help-content">
          <h4>{copy.profile.allowLocation}</h4><p>{copy.profile.locationPermissionHelp}</p>
          <h4>{copy.photos.choose}</h4><p>{copy.profile.cameraPermissionHelp}</p>
          <h4>{copy.profile.reminders}</h4><p>{copy.profile.notificationPermissionHelp}</p>
          <h4>{copy.profile.deviceHelp}</h4><p>{copy.profile.batteryPermissionHelp}</p><p>{copy.profile.settingsManual}</p>
        </div>
      </details>
    </Card>

    <Card className="mk-profile-section" id="profile-inbox">
      <div className="mk-profile-section__heading">
        <h3>{copy.profile.inbox}</h3>
        <Chip kind={props.inboxEnabled ? 'ok' : 'sc'}>{props.inboxEnabled ? copy.profile.inboxEnabled : copy.profile.notConfigured}</Chip>
      </div>
      {!props.inboxEnabled
        ? <p>{copy.profile.inboxUnavailable}</p>
        : props.inboxMessage
          ? <p role="status">{props.inboxMessage}</p>
          : props.inbox.length === 0
            ? <p>{copy.profile.noNotifications}</p>
            : <ul className="inbox-list" role="list">
                {props.inbox.map((item) => (
                  <li key={item.id}>
                    <article className="inbox-item">
                      <div className="inbox-item__body">
                        <h4 className="inbox-item__title">{item.title}</h4>
                        <p className="inbox-item__text">{item.body}</p>
                      </div>
                      {item.created_at && (
                        <time className="inbox-item__time" dateTime={item.created_at}>
                          {new Date(item.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                        </time>
                      )}
                    </article>
                  </li>
                ))}
              </ul>
      }
      <MailLogsDisclosure />
    </Card>

    <Card className="mk-profile-section"><h3>{copy.profile.savedWork}</h3><Row icon={<Icon name="clock" />} label={copy.profile.cachedActiveLabel} value={`${activeVisits} ${copy.profile.activeCached}`} /><PillButton tone="ghost" onClick={props.onSync} disabled={props.busy}>{props.busy ? copy.today.syncing : copy.profile.syncNow}</PillButton></Card>
    <ProfileCareSection profile={props.profile} />
    <ThemeSwitch />
    {props.sosEnabled === false && <Card className="mk-profile-section"><h3>{copy.shell.safetyAlert}</h3><p>{copy.shell.sosDisabled}</p></Card>}
    <Card className="mk-profile-section mk-profile-logout"><h3>{copy.profile.signOutHeading}</h3><p>{copy.profile.signOutHint}</p><PillButton tone="ghost" size="full" onClick={props.onLogout} showArrow={false}>{copy.profile.signOut}</PillButton></Card>
  </section>;
}
