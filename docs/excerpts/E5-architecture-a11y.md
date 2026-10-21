# Spec excerpt: frontend architecture and accessibility (spec 10.1 to 10.4)
## 10. Frontend (React) architecture

### 10.1 Data and state

- Server state: TanStack Query. Keys: `['site']`, `['services']`, `['service', slug]`, `['team']`, etc. Public queries use `staleTime: 60_000`.
- `useSiteSettings()` provides business, home, forms, theme. A `<ThemeStyle>` component writes admin colour overrides as CSS variables.
- Forms: React Hook Form with Zod resolvers; one shared schema per form in `lib/schemas`.
- Admin auth: access token in memory, refresh through the cookie; an Axios/fetch wrapper retries once after a 401 by refreshing.
- No global client state library. Local UI state only (menu open, tab selection).

### 10.2 Routing and layouts

`PublicLayout` wraps public routes (header, footer, sticky bar, scroll to top and focus the `<main>` on route change). `AdminLayout` wraps `/admin/*` behind `RequireAuth` and `RequireRole`. Unknown routes show the 404 page.

### 10.3 Rendering, SEO programme and performance

- **Stays React + Vite** because the owner’s SEO programme is built for it. The public routes are **pre-rendered to static HTML at build time** (for example `vite-plugin-ssg`, `vite-react-ssg` or a Playwright prerender step; use whichever the SEO programme expects) for every enabled language, so search engines and social previews see full content and meta tags without running JavaScript. The admin is never pre-rendered.
- Pre-render data comes from the public API at build time; a Vercel deploy hook (called by the backend when content is published) rebuilds the site. Until that hook exists, a scheduled rebuild (for example hourly) is acceptable. Client-side hydration then keeps pages live.
- Per-page meta through `react-helmet-async`: title, description, canonical, `hreflang` alternates, Open Graph and Twitter tags, JSON-LD (Section 11).
- Budget: first load under 150 KB JS (gzip) on the public home page; LCP under 2.5s on a throttled mid-range phone; CLS under 0.1. Self-host fonts and subset them to the languages enabled, preload the two fonts used above the fold, lazy-load below-the-fold images and the map. Images use `<picture>` and `srcset` with explicit dimensions.

### 10.4 Accessibility checklist

WCAG 2.2 AA. Landmarks `header`, `nav` (aria-label "Main"), `main`, `footer`; one H1 per page; visible focus; tap targets at least 44px (buttons 46px, chips 44px, inputs 48px); contrast as designed; labels on every field; errors with `role="alert"`; decorative SVGs `aria-hidden`; the egg group and the logo have accessible names; the Services dropdown is keyboard operable; reduced-motion respected; page language `en`.

