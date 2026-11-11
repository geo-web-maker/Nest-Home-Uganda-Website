import type { RouteRecord } from 'vite-react-ssg';
import { aboutRoute } from '../features/public/about';
import { areasRoute } from '../features/public/areas';
import { contactRoute } from '../features/public/contact';
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
import { RouteErrorPage } from './RouteErrorPage';

// Dev-only. Vite replaces import.meta.env.DEV with false in production builds,
// so the lazy import below is dropped and the page is never built or pre-rendered.
const devRoutes: RouteRecord[] = import.meta.env.DEV
  ? [{ path: 'design', lazy: async () => ({ Component: (await import('../features/dev/DesignPage')).default }) }]
  : [];

export const routes: RouteRecord[] = [
  {
    path: '/',
    Component: Root,
    ErrorBoundary: RouteErrorPage,
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
          contactRoute,
          jobDetailRoute,
          { path: '*', Component: NotFoundPage },
        ],
      },
      ...devRoutes,
    ],
  },
];
