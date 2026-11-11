import type { RouteRecord } from 'vite-react-ssg';
import { HomePage } from './HomePage';

export const homeRoute: RouteRecord = {
  index: true,
  Component: HomePage,
  entry: 'src/features/public/home/HomePage.tsx',
};
