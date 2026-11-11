import type { RouteRecord } from 'vite-react-ssg';
import { AreasPage } from './AreasPage';

export const areasRoute: RouteRecord = {
  path: 'areas',
  Component: AreasPage,
  entry: 'src/features/public/areas/AreasPage.tsx',
};
