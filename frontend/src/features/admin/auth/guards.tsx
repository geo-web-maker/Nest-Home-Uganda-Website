import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { firstReachablePath, visibleNav } from '../nav';
import { hasScopes } from './hasScopes';
import { NoAccessPage } from './NoAccessPage';
import { useAuth } from './useAuth';

type GuardProps = { children?: ReactNode };

/** Signed-out users go to the login screen and come back; users with no reachable screen see the plain page. */
export function RequireAuth({ children }: GuardProps) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return null;
  if (status === 'signedOut') {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/admin/login" state={{ from }} replace />;
  }
  if (visibleNav(user).length === 0) return <NoAccessPage />;
  return <>{children ?? <Outlet />}</>;
}

/** Use inside RequireAuth. A user without all `scopes` is sent to their first reachable screen. */
export function RequireScopes({
  scopes,
  anyScopes = [],
  children,
}: GuardProps & { scopes: readonly string[]; anyScopes?: readonly string[] }) {
  const { user } = useAuth();
  if (hasScopes(user, scopes) || anyScopes.some((scope) => hasScopes(user, [scope]))) {
    return <>{children ?? <Outlet />}</>;
  }
  const fallback = firstReachablePath(user);
  return fallback ? <Navigate to={fallback} replace /> : <NoAccessPage />;
}
