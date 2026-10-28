import { Head } from 'vite-react-ssg';

const SITE_NAME = 'Well Nest Home Care Uganda';

export type SeoProps = {
  title: string;
  description: string;
  /** Route path, for example "/services". Joined to VITE_SITE_URL for the canonical and og:url. */
  path: string;
  /** Absolute URL, or a path that is joined to VITE_SITE_URL. */
  image?: string;
  jsonLd?: object | object[];
};

function siteUrl(): string {
  return (import.meta.env.VITE_SITE_URL ?? '').replace(/\/+$/, '');
}

function absolute(base: string, value: string): string {
  return /^https?:\/\//.test(value) ? value : `${base}${value}`;
}

// "<" is escaped so a string inside the data can never close the script tag.
function serialise(data: object | object[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function Seo({ title, description, path, image, jsonLd }: SeoProps) {
  const base = siteUrl();
  const url = base ? `${base}${path}` : null;
  const imageUrl = image ? absolute(base, image) : null;

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      {url && <link rel="canonical" href={url} />}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {url && <meta property="og:url" content={url} />}
      {imageUrl && <meta property="og:image" content={imageUrl} />}
      <meta name="twitter:card" content={imageUrl ? 'summary_large_image' : 'summary'} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {imageUrl && <meta name="twitter:image" content={imageUrl} />}
      {jsonLd && <script type="application/ld+json">{serialise(jsonLd)}</script>}
    </Head>
  );
}
