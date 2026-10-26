import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';

export type NurseRouteViews = {
  login: ReactNode;
  today: ReactNode;
  onboarding: ReactNode;
  history: ReactNode;
  profile: ReactNode;
  sync: ReactNode;
  visit: (visitId: string) => ReactNode;
  activeVisit: (visitId: string) => ReactNode;
};
function VisitRoute({ render }: { render: (visitId: string) => ReactNode }) {
  const { visitId = '' } = useParams();
  return <>{render(visitId)}</>;
}

/** Central route table for browser and Capacitor navigation. */
export function NurseRoutes({ views, authenticated }: { views: NurseRouteViews; authenticated: boolean }) {
  return <Routes>
    <Route path="/" element={authenticated ? views.today : views.login} />
    <Route path="/onboarding" element={authenticated ? views.onboarding : views.login} />
    <Route path="/history" element={authenticated ? views.history : views.login} />
    <Route path="/profile" element={authenticated ? views.profile : views.login} />
    <Route path="/sync" element={authenticated ? views.sync : views.login} />
    <Route path="/visit/:visitId" element={authenticated ? <VisitRoute render={views.visit} /> : views.login} />
    <Route path="/active/:visitId" element={authenticated ? <VisitRoute render={views.activeVisit} /> : views.login} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
