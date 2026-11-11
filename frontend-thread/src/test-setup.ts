import '@testing-library/jest-dom/vitest';
import './lib/i18n';

// Head needs the HelmetProvider that vite-react-ssg mounts at runtime, so every test gets a no-op Head.
// Seo.test.tsx overrides this to render its children, because it reads the tags.
vi.mock('vite-react-ssg', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vite-react-ssg')>()),
  Head: () => null,
}));

// Pages read the site settings through one hook. Page tests spy on apiClient.get for their own data, and a second
// GET /public/site would consume their mocks and break call counts, so every test gets the built-in defaults.
// queries.test.tsx loads the real hook with vi.importActual.
vi.mock('./lib/queries/site', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/queries/site')>();
  return { ...actual, useSiteSettings: () => ({ data: actual.DEFAULT_SITE }) };
});

// jsdom has no layout, so it does not implement elementFromPoint. ProseMirror calls it on mousedown, which
// made the mail compose tests throw uncaught errors even though every assertion passed.
if (typeof document.elementFromPoint !== 'function') {
  document.elementFromPoint = () => null;
}
