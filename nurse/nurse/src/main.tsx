import { initTheme } from './lib/theme';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles.css';

initTheme();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
