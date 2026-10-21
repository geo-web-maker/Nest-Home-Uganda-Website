import type { RouteRecord } from 'vite-react-ssg';
import { ServicesPage } from './ServicesPage';

export const servicesRoute: RouteRecord = {
  path: 'services',
  Component: ServicesPage,
  entry: 'src/features/public/services/ServicesPage.tsx',
};
