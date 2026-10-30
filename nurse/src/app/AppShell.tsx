import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { copy } from '../copy';
import { ThemeToggle } from '../components/ThemeToggle';
import { SosControl, type LiveFollowStartResult, type SosSendResult } from '../features/sos/SosSheet';
import type { LocationSnapshot } from '../platform/location';
import { Icon } from '../ui/Icon';
import { Banner } from '../ui/Banner';
import { InstallHint } from '../pwa/InstallHint';

type Props = {
  children: ReactNode; online: boolean; queued: number; authenticated: boolean; message?: string; syncing?: boolean;
  sosEnabled: boolean; smsHref: string; emergencyNumbers?: string[]; supervisorPhone?: string | null;
  liveFollowEnabled?: boolean; liveFollowMinutes?: number; liveFollowIntervalSeconds?: number;
  sosHoldSeconds?: number; sosCancelWindowSeconds?: number;
  onSendSos: () => Promise<SosSendResult | void>;
  onStartSosFollow?: (caseId: string) => Promise<LiveFollowStartResult>;
  onPingSosFollow?: (caseId: string, snapshot: LocationSnapshot, capturedAt: string) => Promise<void>;
  onSafeNow?: (caseId: string) => Promise<void>;
};

const NAV = [
  { to: '/', label: copy.tabs.today, icon: 'today' },
  { to: '/history', label: copy.tabs.history, icon: 'hist' },
  { to: '/timesheets', label: copy.tabs.timesheets, icon: 'doc' },
  { to: '/profile', label: copy.tabs.profile, icon: 'user' },
] as const;

function navIsCurrent(pathname: string, to: string) {
  if (to === '/') return pathname === '/' || pathname.startsWith('/visit/') || pathname.startsWith('/active/');
  if (to === '/profile') return pathname === '/profile' || pathname === '/sync';
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function AppShell({ children, online, queued, authenticated, message, syncing: syncingNow = false, sosEnabled, smsHref, emergencyNumbers = [], supervisorPhone, liveFollowEnabled = false, liveFollowMinutes = 30, liveFollowIntervalSeconds = 30, sosHoldSeconds = 2, sosCancelWindowSeconds = 5, onSendSos, onStartSosFollow, onPingSosFollow, onSafeNow }: Props) {
  const location = useLocation();
  const previousOnline = useRef(online);
  const backOnline = online && !previousOnline.current;
  const syncing = syncingNow || message === copy.messages.syncStarted || message === copy.messages.notificationOpenedSyncing;
  const syncProblem = message === copy.messages.syncFailed;
  useEffect(() => { previousOnline.current = online; }, [online]);
  const showConnection = !online || queued > 0 || syncing || syncProblem;
  // The connection banner already says "Syncing saved changes…"; repeating it as a toast made two banners compete for the same space.
  const showToast = Boolean(message) && !(message === copy.messages.syncStarted || message === copy.messages.notificationOpenedSyncing);
  const bannerLabel = backOnline ? copy.shell.backOnlineLabel : online ? copy.shell.onlineLabel : copy.shell.offlineLabel;
  const bannerText = syncing ? copy.shell.syncing : syncProblem ? copy.shell.problem : queued > 0 ? `${queued} ${copy.shell.waiting}` : online ? copy.shell.saved : copy.shell.offline;
  const navigation = (className: string) => <nav className={className} aria-label={copy.shell.mainNavigation}>
    {NAV.map((item) => <Link key={item.to} to={item.to} aria-current={navIsCurrent(location.pathname, item.to) ? 'page' : undefined}>
      <Icon name={item.icon} /><span>{item.label}</span>
    </Link>)}
  </nav>;

  return <div className={authenticated ? 'nurse-app' : 'nurse-app nurse-app--guest'}>
    <div className="shell-tools"><ThemeToggle /></div>
    <InstallHint />
    {(showConnection || showToast) && <div className="mk-status-stack">
      {showConnection && <div className={`connection-banner mk-connection-banner${online ? ' is-online' : ' is-offline'}`} role="status" aria-live="polite">
        <strong>{bannerLabel}</strong><span>{bannerText}</span><Link to="/sync">{queued > 0 ? `${queued} ${copy.shell.waiting}` : copy.shell.syncStatus}</Link>
      </div>}
      {showToast && <Banner className="mk-toast" tone={syncProblem ? 'warn' : 'info'}>{message}</Banner>}
    </div>}
    {authenticated && navigation('desktop-rail')}
    <main className="app-shell">{children}</main>
    {authenticated && navigation('bottom-tabs')}
    {authenticated && <aside className="sos-dock" aria-label={copy.shell.safetyAlert}>
      {!sosEnabled && <span className="sos-disabled-note">{copy.shell.sosDisabled}</span>}
      <SosControl enabled={sosEnabled} smsHref={smsHref} emergencyNumbers={emergencyNumbers} supervisorPhone={supervisorPhone} liveFollowEnabled={liveFollowEnabled} liveFollowMinutes={liveFollowMinutes} liveFollowIntervalSeconds={liveFollowIntervalSeconds} holdSeconds={sosHoldSeconds} cancelWindowSeconds={sosCancelWindowSeconds} onSend={onSendSos} onStartFollow={onStartSosFollow} onPingFollow={onPingSosFollow} onSafeNow={onSafeNow} />
    </aside>}
  </div>;
}
