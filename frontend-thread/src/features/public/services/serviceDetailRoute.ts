import type { RouteRecord } from 'vite-react-ssg';
import { ServiceDetailPage } from './ServiceDetailPage';
export const serviceDetailRoute: RouteRecord = {
  path: 'services/:slug',
  Component: ServiceDetailPage,
  entry: 'src/features/public/services/ServiceDetailPage.tsx',
};
