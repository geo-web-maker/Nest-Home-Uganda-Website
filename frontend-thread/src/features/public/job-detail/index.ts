import type { RouteRecord } from 'vite-react-ssg';
import { JobDetailPage } from './JobDetailPage';

export const jobDetailRoute: RouteRecord = {
  path: 'careers/:id',
  Component: JobDetailPage,
  entry: 'src/features/public/job-detail/JobDetailPage.tsx',
};
