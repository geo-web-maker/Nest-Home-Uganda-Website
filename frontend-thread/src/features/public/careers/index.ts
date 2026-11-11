import type { RouteRecord } from 'vite-react-ssg';
import { CareersPage } from './CareersPage';

export { jobDetailRoute } from '../job-detail';
export const careersRoute: RouteRecord = {
  path: 'careers',
  Component: CareersPage,
  entry: 'src/features/public/careers/CareersPage.tsx',
};
