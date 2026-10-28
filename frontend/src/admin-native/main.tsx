import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ViteReactSSG } from 'vite-react-ssg/single-page';
import { Component as AdminApp } from '../features/admin/AdminApp';
import '../lib/i18n';
import { createQueryClient } from '../lib/queries/queryClient';
import '../design/tokens.css';
import '../design/fonts.css';
import '../design/global.css';
import '../design/motion.css';

// The admin pages use `Head` (needs the HelmetProvider vite-react-ssg mounts) and TanStack Query
// (provided by app/Root.tsx in the public build). The single-page client mounts the helmet
// provider and renders into #root in a plain `vite build`; there is no pre-rendering here.
const queryClient = createQueryClient();

ViteReactSSG(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="*" element={<AdminApp />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
