import type { ReactNode } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { copy } from '../copy';
import { SosControl, type LiveFollowStartResult, type SosSendResult } from '../features/sos/SosSheet';
import type { LocationSnapshot } from '../platform/location';

type Props = {
  children: ReactNode;
  online: boolean;
  queued: number;
  authenticated: boolean;
  message?: string;
  sosEnabled: boolean;
  smsHref: string;
  emergencyNumbers?: string[];
  supervisorPhone?: string | null;
  liveFollowEnabled?: boolean;
  liveFollowMinutes?: number;
  liveFollowIntervalSeconds?: number;
  sosHoldSeconds?: number;
  sosCancelWindowSeconds?: number;
  onSendSos: () => Promise<SosSendResult | void>;
  onStartSosFollow?: (caseId: string) => Promise<LiveFollowStartResult>;
  onPingSosFollow?: (caseId: string, snapshot: LocationSnapshot, capturedAt: string) => Promise<void>;
  onSafeNow?: (caseId: string) => Promise<void>;
};

export function AppShell({ children, online, queued, authenticated, message, sosEnabled, smsHref, emergencyNumbers = [], supervisorPhone, liveFollowEnabled = false, liveFollowMinutes = 30, liveFollowIntervalSeconds = 30, sosHoldSeconds = 2, sosCancelWindowSeconds = 5, onSendSos, onStartSosFollow, onPingSosFollow, onSafeNow }: Props) {
  const location = useLocation();
  const previousOnline = useRef(online);
  const backOnline = online && !previousOnline.current;
  const syncing = message === copy.messages.syncStarted || message === copy.messages.notificationOpenedSyncing;
  const syncProblem = message === copy.messages.syncFailed;
  useEffect(() => { previousOnline.current = online; }, [online]);
  const bannerLabel = backOnline ? copy.shell.backOnlineLabel : online ? copy.shell.onlineLabel : copy.shell.offlineLabel;
  const bannerText = syncing ? copy.shell.syncing : syncProblem ? copy.shell.problem : online && queued === 0 ? copy.shell.saved : online ? copy.shell.online : copy.shell.offline;
  return (
    <div className={authenticated ? 'nurse-app' : 'nurse-app nurse-app--guest'}>
      <header className="app-header">
        <p className="eyebrow">{copy.organisation}</p>
        <h1>{copy.appName}</h1>
        <p>{copy.offlinePurpose}</p>
      </header>
      {(authenticated || !online) && <div className={`connection-banner ${online ? 'is-online' : 'is-offline'}`} role="status" aria-live="polite">
        <strong role="heading" aria-level={2}>{bannerLabel}</strong>
        <span>{bannerText}</span>
        <Link to="/sync">{queued} {copy.shell.waiting}</Link>
      </div>}
      {message && <p className="notice" role="status">{message}</p>}
      {authenticated && (
        <nav className="desktop-rail" aria-label={copy.shell.mainNavigation}>
          <p className="desktop-rail-title">{copy.today.heading}</p>
          <NavLink to="/" end aria-current={location.pathname === '/' ? 'page' : undefined}>
            <span className="rail-icon" aria-hidden="true">▣</span><span>{copy.tabs.today}</span>
          </NavLink>
          <NavLink to="/history" aria-current={location.pathname === '/history' ? 'page' : undefined}>
            <span className="rail-icon" aria-hidden="true">◷</span><span>{copy.tabs.history}</span>
          </NavLink>
          <NavLink to="/timesheets" aria-current={location.pathname === '/timesheets' ? 'page' : undefined}>
            <span className="rail-icon" aria-hidden="true">▤</span><span>{copy.tabs.timesheets}</span>
          </NavLink>
          <NavLink to="/profile" aria-current={location.pathname === '/profile' ? 'page' : undefined}>
            <span className="rail-icon" aria-hidden="true">♙</span><span>{copy.tabs.profile}</span>
          </NavLink>
        </nav>
      )}
      <main className="app-shell">{children}</main>
      {authenticated && (
        <nav className="bottom-tabs" aria-label={copy.shell.mainNavigation}>
          <NavLink to="/" end aria-current={location.pathname === '/' ? 'page' : undefined}><span aria-hidden="true">▣</span><span>{copy.tabs.today}</span></NavLink>
          <NavLink to="/history" aria-current={location.pathname === '/history' ? 'page' : undefined}><span aria-hidden="true">◷</span><span>{copy.tabs.history}</span></NavLink>
          <NavLink to="/timesheets" aria-current={location.pathname === '/timesheets' ? 'page' : undefined}><span aria-hidden="true">▤</span><span>{copy.tabs.timesheets}</span></NavLink>
          <NavLink to="/profile" aria-current={location.pathname === '/profile' ? 'page' : undefined}><span aria-hidden="true">♙</span><span>{copy.tabs.profile}</span></NavLink>
        </nav>
      )}
      {authenticated && (
        <aside className="sos-dock" aria-label={copy.shell.safetyAlert}>
          {!sosEnabled && <span className="sos-disabled-note">{copy.shell.sosDisabled}</span>}
          <SosControl enabled={sosEnabled} smsHref={smsHref} emergencyNumbers={emergencyNumbers} supervisorPhone={supervisorPhone} liveFollowEnabled={liveFollowEnabled} liveFollowMinutes={liveFollowMinutes} liveFollowIntervalSeconds={liveFollowIntervalSeconds} holdSeconds={sosHoldSeconds} cancelWindowSeconds={sosCancelWindowSeconds} onSend={onSendSos} onStartFollow={onStartSosFollow} onPingFollow={onPingSosFollow} onSafeNow={onSafeNow} />
        </aside>
      )}
    </div>
  );
}
