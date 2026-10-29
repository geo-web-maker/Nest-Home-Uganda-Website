import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './AdminLayout';
import { AuthProvider } from './auth/useAuth';
import { RequireAuth, RequireScopes } from './auth/guards';
import { LoginPage } from './auth/LoginPage';
import { SetPasswordPage } from './auth/SetPasswordPage';
import { ApplicantDetailPage } from './applications/ApplicantDetailPage';
import { ClientDetailPage } from './care/clients/ClientDetailPage';
import { NurseDetailPage } from './care/nurses/NurseDetailPage';
import { SOSConsolePage } from './care/SafetyAndSetupPages';
import { EnquiryDetailPage } from './enquiry-detail';
import { JobEditorPage } from './jobs/JobEditorPage';
import { ADMIN_NAV, scopesFor } from './nav';
import { AdminPlaceholder, adminScreens } from './screens';

// Mounted at `admin/*` and loaded with React.lazy, so public visitors never download it.
// Paths here are relative to /admin. The dashboard is the index route.
const relative = (path: string) => path.replace(/^\/admin\/?/, '');

export function Component() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route path="set-password" element={<SetPasswordPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AdminLayout />}>
            {ADMIN_NAV.map((item) => {
              const Screen = adminScreens[item.path];
              const element = (
                <RequireScopes
                  scopes={item.scopes}
                  anyScopes={item.path === '/admin/settings' ? ['system:manage'] : []}
                >
                  {Screen ? <Screen /> : <AdminPlaceholder item={item} />}
                </RequireScopes>
              );
              return item.path === '/admin' ? (
                <Route key={item.path} index element={element} />
              ) : item.path === '/admin/care/visits' ? (
                <Route key={item.path} path="care/visits/*" element={element} />
              ) : (
                <Route key={item.path} path={relative(item.path)} element={element} />
              );
            })}
            <Route path="care" element={<Navigate to="/admin/care/clients" replace />} />
            {/* Detail routes use their list's scopes (spec 12.3). The editors gate their own write actions. */}
            <Route
              path="enquiries/:id"
              element={
                <RequireScopes scopes={scopesFor('/admin/enquiries')}>
                  <EnquiryDetailPage />
                </RequireScopes>
              }
            />
            <Route
              path="careers/new"
              element={
                <RequireScopes scopes={scopesFor('/admin/careers')}>
                  <JobEditorPage />
                </RequireScopes>
              }
            />
            <Route
              path="careers/:id"
              element={
                <RequireScopes scopes={scopesFor('/admin/careers')}>
                  <JobEditorPage />
                </RequireScopes>
              }
            />
            <Route
              path="care/clients/:id"
              element={
                <RequireScopes scopes={['clients:read']}>
                  <ClientDetailPage />
                </RequireScopes>
              }
            />
            <Route
              path="care/nurses/:userId"
              element={
                <RequireScopes scopes={['nurses:read']}>
                  <NurseDetailPage />
                </RequireScopes>
              }
            />
            <Route
              path="care/sos/:id"
              element={
                <RequireScopes scopes={['alerts:read']}>
                  <SOSConsolePage />
                </RequireScopes>
              }
            />
            <Route
              path="applications/:id"
              element={
                <RequireScopes scopes={scopesFor('/admin/applications')}>
                  <ApplicantDetailPage />
                </RequireScopes>
              }
            />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
