import '@testing-library/jest-dom/vitest';
import './lib/i18n';

// Head needs the HelmetProvider that vite-react-ssg mounts at runtime, so every test gets a no-op Head.
// Seo.test.tsx overrides this to render its children, because it reads the tags.
vi.mock('vite-react-ssg', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vite-react-ssg')>()),
  Head: () => null,
}));
