import { render } from '@testing-library/react';
import { Seo } from './Seo';

// Head needs the HelmetProvider that vite-react-ssg mounts at runtime. Here it renders its children
// in place so the tags can be read; the real head output is checked by the pre-render build in S3.10.
vi.mock('vite-react-ssg', () => ({
  Head: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const BASE = { title: 'Services | Nest', description: 'Eight kinds of care.', path: '/services' };

const meta = (c: HTMLElement, sel: string) => c.querySelector(sel)?.getAttribute('content');

describe('Seo', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('emits title, description, canonical and Open Graph from the site URL', () => {
    vi.stubEnv('VITE_SITE_URL', 'https://nest.test/');
    const { container } = render(<Seo {...BASE} />);
    expect(container.querySelector('title')?.textContent).toBe('Services | Nest');
    expect(meta(container, 'meta[name="description"]')).toBe('Eight kinds of care.');
    expect(container.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://nest.test/services',
    );
    expect(meta(container, 'meta[property="og:url"]')).toBe('https://nest.test/services');
    expect(meta(container, 'meta[property="og:title"]')).toBe('Services | Nest');
    expect(meta(container, 'meta[property="og:type"]')).toBe('website');
  });

  it('uses the summary card without an image and the large card with one', () => {
    vi.stubEnv('VITE_SITE_URL', 'https://nest.test');
    const plain = render(<Seo {...BASE} />);
    expect(meta(plain.container, 'meta[name="twitter:card"]')).toBe('summary');
    expect(plain.container.querySelector('meta[property="og:image"]')).toBeNull();
    plain.unmount();

    const { container } = render(<Seo {...BASE} image="/images/og.jpg" />);
    expect(meta(container, 'meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(meta(container, 'meta[property="og:image"]')).toBe('https://nest.test/images/og.jpg');
    expect(meta(container, 'meta[name="twitter:image"]')).toBe('https://nest.test/images/og.jpg');
  });

  it('keeps an absolute image URL as given', () => {
    vi.stubEnv('VITE_SITE_URL', 'https://nest.test');
    const { container } = render(<Seo {...BASE} image="https://cdn.test/a.jpg" />);
    expect(meta(container, 'meta[property="og:image"]')).toBe('https://cdn.test/a.jpg');
  });

  it('omits canonical and og:url when no site URL is configured', () => {
    vi.stubEnv('VITE_SITE_URL', '');
    const { container } = render(<Seo {...BASE} />);
    expect(container.querySelector('link[rel="canonical"]')).toBeNull();
    expect(container.querySelector('meta[property="og:url"]')).toBeNull();
  });

  it('writes JSON-LD and escapes "<" so it cannot close the script tag', () => {
    vi.stubEnv('VITE_SITE_URL', 'https://nest.test');
    const { container } = render(
      <Seo {...BASE} jsonLd={{ '@type': 'Organization', name: 'A </script> B' }} />,
    );
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script?.textContent).not.toContain('</script>');
    expect(JSON.parse(script?.textContent ?? '{}')).toMatchObject({
      '@type': 'Organization',
      name: 'A </script> B',
    });
  });

  it('renders no JSON-LD script when none is given', () => {
    const { container } = render(<Seo {...BASE} />);
    expect(container.querySelector('script')).toBeNull();
  });
});
