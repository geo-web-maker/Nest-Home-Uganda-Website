import { Navigate, useLocation } from 'react-router-dom';
import { normalizeAdminUrl } from '../lib/normalizeAdminUrl';

export function LegacyAdminRedirect() {
  const location = useLocation();
  const target = normalizeAdminUrl(
    `${location.pathname}${location.search}${location.hash}`,
    window.location.origin,
  );
  return <Navigate to={target} replace />;
}
