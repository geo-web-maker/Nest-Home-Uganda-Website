import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { QueryClientProvider } from '@tanstack/react-query';
import { initTheme } from '@shared/lib/theme';
import { installClientErrorCapture } from '@shared/lib/api/clientErrors';
import { createQueryClient } from '@shared/lib/queries/queryClient';
import { LegacyAdminRedirect } from './routing/LegacyAdminRedirect';
import { Component as AdminApp } from './features/admin/AdminApp';
import '@shared/lib/i18n';
import '@shared/design/tokens.css';
import '@shared/design/fonts.css';
import '@shared/design/global.css';
import '@shared/design/motion.css';
import { startWebBundleUpdates } from './admin-native/webBundle';
import { OfflineNotice } from './admin-native/OfflineNotice';
import { restoreQueryCache, startQueryPersistence } from './admin-native/queryPersistence';
import { installConnectionMonitor } from './admin-native/connection';
import { installWriteQueue } from './admin-native/writeQueue';
import { installUpgradeRequiredHandler } from './admin-native/upgradeRequired';

initTheme();
installUpgradeRequiredHandler();
if (typeof window !== 'undefined') installClientErrorCapture();
// offlineFirst: a screen with saved data shows it at once, and one without fails fast instead of waiting forever.
// gcTime outlasts a working day so saved results are not dropped from memory while the app stays open.
const queryClient = createQueryClient({
  defaultOptions: {
    queries: { networkMode: 'offlineFirst', gcTime: 24 * 60 * 60 * 1000 },
    mutations: { networkMode: 'always' }, // writes go through apiClient, which saves allowed ones to the write queue when offline
  },
});

async function start(): Promise<void> {
  await restoreQueryCache(queryClient);
  startQueryPersistence(queryClient);
  installConnectionMonitor();
  installWriteQueue(queryClient);
  render();
}

function render(): void {
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            {/* Compatibility route for old bookmarks, email links and push payloads. */}
            <Route path="admin/*" element={<LegacyAdminRedirect />} />
            <Route path="/*" element={<AdminApp />} />
          </Routes>
        </BrowserRouter>
        <OfflineNotice />
      </QueryClientProvider>
    </HelmetProvider>
  </StrictMode>,
);
}

void start();
startWebBundleUpdates('admin');
