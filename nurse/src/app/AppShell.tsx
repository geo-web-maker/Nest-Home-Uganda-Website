import type { ReactNode } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { copy } from '../copy';
import { SosControl } from '../features/sos/SosSheet';

type Props = {
  children: ReactNode;
  online: boolean;
  queued: number;
  authenticated: boolean;
  message?: string;
  sosEnabled: boolean;
  smsHref: string;
  onSendSos: () => Promise<void>;
};

export function AppShell({ children, online, queued, authenticated, message, sosEnabled, smsHref, onSendSos }: Props) {
  const location = useLocation();
  return (
    <div className="nurse-app">
      <header className="app-header">
        <p className="eyebrow">{copy.organisation}</p>
        <h1>{copy.appName}</h1>
        <p>{copy.offlinePurpose}</p>
      </header>
      <div className={`connection-banner ${online ? 'is-online' : 'is-offline'}`} role="status" aria-live="polite">
        <strong>{online ? copy.shell.onlineLabel : copy.shell.offlineLabel}</strong>
        <span>{online ? copy.shell.online : copy.shell.offline}</span>
        <Link to="/sync">{queued} {copy.shell.waiting}</Link>
      </div>
      {message && <p className="notice" role="status">{message}</p>}
      {authenticated && (
        <nav className="desktop-rail" aria-label={copy.shell.mainNavigation}>
          <p className="desktop-rail-title">Your workspace</p>
          <NavLink to="/" end aria-current={location.pathname === '/' ? 'page' : undefined}>
            <span className="rail-icon" aria-hidden="true">◷</span><span>{copy.tabs.today}</span>
          </NavLink>
          <NavLink to="/history" aria-current={location.pathname === '/history' ? 'page' : undefined}>
            <span className="rail-icon" aria-hidden="true">↺</span><span>{copy.tabs.history}</span>
          </NavLink>
          <NavLink to="/profile" aria-current={location.pathname === '/profile' ? 'page' : undefined}>
            <span className="rail-icon" aria-hidden="true">◎</span><span>{copy.tabs.profile}</span>
          </NavLink>
        </nav>
      )}
      <main className="app-shell">{children}</main>
      {authenticated && (
        <nav className="bottom-tabs" aria-label={copy.shell.mainNavigation}>
          <NavLink to="/" end aria-current={location.pathname === '/' ? 'page' : undefined}>{copy.tabs.today}</NavLink>
          <NavLink to="/history" aria-current={location.pathname === '/history' ? 'page' : undefined}>{copy.tabs.history}</NavLink>
          <NavLink to="/profile" aria-current={location.pathname === '/profile' ? 'page' : undefined}>{copy.tabs.profile}</NavLink>
        </nav>
      )}
      {authenticated && (
        <aside className="sos-dock" aria-label={copy.shell.safetyAlert}>
          {!sosEnabled && <span className="sos-disabled-note">{copy.shell.sosDisabled}</span>}
          <SosControl enabled={sosEnabled} smsHref={smsHref} onSend={onSendSos} />
        </aside>
      )}
    </div>
  );
}
