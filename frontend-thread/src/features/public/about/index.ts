import type { RouteRecord } from 'vite-react-ssg';
import { AboutPage } from './AboutPage';

export const aboutRoute: RouteRecord = {
  path: 'about',
  Component: AboutPage,
  entry: 'src/features/public/about/AboutPage.tsx',
};
