import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Component as AdminApp } from '../features/admin/AdminApp';
import '../design/tokens.css';
import '../design/fonts.css';
import '../design/global.css';
import '../design/motion.css';

const root = document.getElementById('root');
if (!root) throw new Error('Admin native root element was not found.');
createRoot(root).render(<StrictMode><BrowserRouter><Routes><Route path="/admin/*" element={<AdminApp />} /><Route path="*" element={<AdminApp />} /></Routes></BrowserRouter></StrictMode>);
