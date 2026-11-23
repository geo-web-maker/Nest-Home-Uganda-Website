import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { copy } from '../copy';
import { ThemeToggle } from '../components/ThemeToggle';
import { MARK_VIEWBOX, MARK_PETALS, MARK_LEAVES, MARK_CROSS } from '../ui/markPaths';
import { SosControl, type LiveFollowStartResult, type SosSendResult } from '../features/sos/SosSheet';
import type { LocationSnapshot } from '../platform/location';
import { Icon } from '../ui/Icon';
import { Banner } from '../ui/Banner';
import { InstallHint } from '../pwa/InstallHint';
import { UpdatePrompt } from '../pwa/UpdatePrompt';
import { isProblemMessage } from './useToast';

type Props = {
  children: ReactNode; online: boolean; queued: number; authenticated: boolean; message?: string; syncing?: boolean;
  sosEnabled: boolean; smsHref: string; emergencyNumbers?: string[]; supervisorPhone?: string | null;
  liveFollowEnabled?: boolean; liveFollowMinutes?: number; liveFollowIntervalSeconds?: number;
  sosHoldSeconds?: number; sosCancelWindowSeconds?: number;
  onSendSos: () => Promise<SosSendResult | void>;
  onStartSosFollow?: (caseId: string) => Promise<LiveFollowStartResult>;
  onPingSosFollow?: (caseId: string, snapshot: LocationSnapshot, capturedAt: string) => Promise<void>;
  onSafeNow?: (caseId: string) => Promise<void>;
  /** Clears the floating message. Without it the message is shown without a close button. */
  onDismissMessage?: () => void;
};

const NAV = [
  { to: '/', label: copy.tabs.today, short: copy.tabs.today, icon: 'today' },
  { to: '/history', label: copy.tabs.history, short: copy.tabs.history, icon: 'hist' },
  { to: '/timesheets', label: copy.tabs.timesheets, short: 'Hours', icon: 'clock' },
  { to: '/documents', label: 'Documents', short: 'Docs', icon: 'doc' },
  { to: '/mail', label: copy.mail.title, short: copy.mail.title, icon: 'mail' },
  { to: '/audit', label: 'Activity', short: 'Activity', icon: 'activity' },
  { to: '/profile', label: copy.tabs.profile, short: copy.tabs.profile, icon: 'user' },
] as const;

function navIsCurrent(pathname: string, to: string) {
  if (to === '/') return pathname === '/' || pathname.startsWith('/visit/') || pathname.startsWith('/active/');
  if (to === '/mail') return pathname === '/mail' || pathname.startsWith('/mail/');
  if (to === '/audit') return pathname === '/audit' || pathname.startsWith('/audit/');
  if (to === '/profile') return pathname === '/profile' || pathname === '/sync' || pathname === '/app-center';
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function AppShell({ children, online, queued, authenticated, message, syncing: syncingNow = false, sosEnabled, smsHref, emergencyNumbers = [], supervisorPhone, liveFollowEnabled = false, liveFollowMinutes = 30, liveFollowIntervalSeconds = 30, sosHoldSeconds = 2, sosCancelWindowSeconds = 5, onSendSos, onStartSosFollow, onPingSosFollow, onSafeNow, onDismissMessage }: Props) {
  const location = useLocation();
  const previousOnline = useRef(online);
  const backOnline = online && !previousOnline.current;
  const syncing = syncingNow || message === copy.messages.syncStarted || message === copy.messages.notificationOpenedSyncing;
  const syncProblem = message === copy.messages.syncFailed;
  useEffect(() => { previousOnline.current = online; }, [online]);
  const showConnection = !online || queued > 0 || syncing || syncProblem;
  // The connection banner already says "Syncing saved changes…"; repeating it as a toast made two banners compete for the same space.
  // One notice per cause: the connection banner already carries "syncing" and "could not sync", so those never repeat as a toast.
  const showToast = Boolean(message) && !(message === copy.messages.syncStarted || message === copy.messages.notificationOpenedSyncing || syncProblem);
  const bannerLabel = backOnline ? copy.shell.backOnlineLabel : online ? copy.shell.onlineLabel : copy.shell.offlineLabel;
  const bannerText = syncing ? copy.shell.syncing : syncProblem ? copy.messages.syncFailed : queued > 0 ? `${queued} ${copy.shell.waiting}` : online ? copy.shell.saved : copy.shell.offline;
  const navigation = (className: string) => <nav className={className} aria-label={copy.shell.mainNavigation}>
    {NAV.map((item) => <Link key={item.to} to={item.to} aria-label={item.label} aria-current={navIsCurrent(location.pathname, item.to) ? 'page' : undefined}>
      <Icon name={item.icon} /><span className="nav-label" aria-hidden="true">{item.label}</span><span className="nav-short" aria-hidden="true">{item.short}</span>
    </Link>)}
  </nav>;

  return <div className={authenticated ? 'nurse-app' : 'nurse-app nurse-app--guest'}>
    {authenticated
      ? <div className="shell-topbar">
          <svg
            className="shell-topbar__mark"
            viewBox={MARK_VIEWBOX}
            xmlns="http://www.w3.org/2000/svg"
            aria-label={copy.appShortName}
            role="img"
          >
            {MARK_PETALS.map((p, i) => <path key={i} fill={p.fill} d={p.d} />)}
            <path className="shell-mark-leaf" d={MARK_LEAVES} />
            <path className="shell-mark-cross" d={MARK_CROSS} />
          </svg>
          <div className="shell-topbar__actions">
            <Link to="/app-center" className="shell-topbar__link" aria-label="App Center" aria-current={location.pathname === '/app-center' ? 'page' : undefined}><Icon name="download" /><span>App Center</span></Link>
            <ThemeToggle />
          </div>
        </div>
      : <div className="shell-tools"><ThemeToggle /></div>}
    <InstallHint />
    <div className="mk-toast-region">
      <UpdatePrompt />
      {showToast && <Banner className="mk-toast" floating onDismiss={onDismissMessage ?? (() => undefined)} tone={syncProblem ? 'warn' : isProblemMessage(message ?? '') ? 'bad' : 'info'} role={isProblemMessage(message ?? '') ? 'alert' : 'status'}>{message}</Banner>}
    </div>
    {showConnection && <div className="mk-status-stack">
      <div className={`connection-banner mk-connection-banner${online ? ' is-online' : ' is-offline'}`} role="status" aria-live="polite">
        <Link to="/sync" className="mk-status-link" aria-label={`${bannerLabel}. ${bannerText}. ${copy.shell.syncStatus}`}>
          <strong>{bannerLabel}</strong><span className="mk-status-text">{bannerText}</span><Icon name="arrow" size={16} />
        </Link>
      </div>
    </div>}
    {authenticated && navigation('desktop-rail')}
    <main className="app-shell">{children}</main>
    {authenticated && navigation('bottom-tabs')}
    {authenticated && sosEnabled && <aside className="sos-dock" aria-label={copy.shell.safetyAlert}>
      <SosControl enabled={sosEnabled} smsHref={smsHref} emergencyNumbers={emergencyNumbers} supervisorPhone={supervisorPhone} liveFollowEnabled={liveFollowEnabled} liveFollowMinutes={liveFollowMinutes} liveFollowIntervalSeconds={liveFollowIntervalSeconds} holdSeconds={sosHoldSeconds} cancelWindowSeconds={sosCancelWindowSeconds} onSend={onSendSos} onStartFollow={onStartSosFollow} onPingFollow={onPingSosFollow} onSafeNow={onSafeNow} />
    </aside>}
  </div>;
}
