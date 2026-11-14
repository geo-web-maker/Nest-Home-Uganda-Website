import React, { StrictMode } from 'react';
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

initTheme();
if (typeof window !== 'undefined') installClientErrorCapture();
const queryClient = createQueryClient();

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
      </QueryClientProvider>
    </HelmetProvider>
  </StrictMode>,
);
