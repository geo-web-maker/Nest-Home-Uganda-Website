import type { RouteRecord } from 'vite-react-ssg';
import { aboutRoute } from '../features/public/about';
import { areasRoute } from '../features/public/areas';
import { careersRoute, jobDetailRoute } from '../features/public/careers';
import { articleRoute, faqRoute } from '../features/public/faq';
import { homeRoute } from '../features/public/home';
import { howItWorksRoute } from '../features/public/how-it-works';
import { NotFoundPage } from '../features/public/NotFoundPage';
import { privacyRoute } from '../features/public/privacy';
import { servicesRoute } from '../features/public/services';
import { serviceDetailRoute } from '../features/public/services/serviceDetailRoute';
import { teamRoute } from '../features/public/team';
import { PublicLayout } from './PublicLayout';
import { Root } from './Root';

// Dev-only. Vite replaces import.meta.env.DEV with false in production builds,
// so the lazy import below is dropped and the page is never built or pre-rendered.
const devRoutes: RouteRecord[] = import.meta.env.DEV
  ? [{ path: 'design', lazy: () => import('../features/dev/DesignPage') }]
  : [];

export const routes: RouteRecord[] = [
  {
    path: '/',
    Component: Root,
    entry: 'src/app/routes.tsx',
    children: [
      {
        Component: PublicLayout,
        children: [
          homeRoute,
          servicesRoute,
          serviceDetailRoute,
          aboutRoute,
          teamRoute,
          howItWorksRoute,
          areasRoute,
          faqRoute,
          articleRoute,
          privacyRoute,
          careersRoute,
          jobDetailRoute,
          { path: '*', Component: NotFoundPage },
        ],
      },
      // Admin: lazy, so the public bundle does not grow. `admin/*` is a splat, so it is not pre-rendered.
      { path: 'admin/*', lazy: () => import('../features/admin/AdminApp') },
      ...devRoutes,
    ],
  },
];
