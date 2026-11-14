// TODO(gen-types): replace with generated types
export type ContentKind =
  | 'services'
  | 'team'
  | 'faqs'
  | 'testimonials'
  | 'areas'
  | 'pricing'
  | 'articles'
  | 'pages'
  | 'media';
export type ContentRecord = { id: string; [key: string]: unknown };
export type ContentList =
  ContentRecord[] | { items: ContentRecord[]; total: number; page: number; page_size: number };
export type ContentField = {
  key: string;
  kind: 'text' | 'textarea' | 'boolean' | 'number' | 'localized' | 'lines';
  required?: boolean;
};
