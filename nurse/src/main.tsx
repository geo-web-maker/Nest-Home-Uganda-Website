import { initTheme } from './lib/theme';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { installNurseClientErrorCapture } from './lib/clientErrors';
import { ClientErrorBoundary } from './components/ClientErrorBoundary';
import './styles.css';

initTheme();
installNurseClientErrorCapture();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ClientErrorBoundary><App /></ClientErrorBoundary></React.StrictMode>,
);
