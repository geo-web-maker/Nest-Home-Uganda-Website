import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { firstReachablePath, visibleNav } from '../nav';
import { hasScopes } from './hasScopes';
import { NoAccessPage } from './NoAccessPage';
import { LoadingScreen } from '../../../components/admin/LoadingScreen';
import { useAuth } from './useAuth';
import { apiClient } from '@shared/lib/api/client';
import type { AppAccess } from '../../../admin-native/appSwitch';

type GuardProps = { children?: ReactNode };

/** Signed-out users go to login. The server's app-access policy gates the entire admin shell. */
export function RequireAuth({ children }: GuardProps) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <LoadingScreen label="Opening your workspace…" />;
  if (status === 'signedOut') {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/login" state={{ from }} replace />;
  }
  return <RequireAdminAppAccess userId={user?.id ?? ''}>{children ?? <Outlet />}</RequireAdminAppAccess>;
}

function RequireAdminAppAccess({ children, userId }: GuardProps & { userId: string }) {
  const { user } = useAuth();
  const [access, setAccess] = useState<AppAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setLoading(true); setError(''); setAccess(null);
    apiClient.get<AppAccess>('/auth/app-access')
      .then((result) => { if (live) setAccess(result); })
      .catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : 'Admin app access could not be verified.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [userId]);

  if (loading) return <LoadingScreen label="Checking application access…" />;
  // Fail closed if the central capability check cannot be verified. The user can retry or sign out.
  if (error || !access?.admin.allowed) return <NoAccessPage access={access} accessError={error} />;
  if (visibleNav(user).length === 0) return <NoAccessPage access={access} />;
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
