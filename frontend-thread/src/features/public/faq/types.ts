// TODO(gen-types): replace with generated types
export type FaqPublic = {
  id: string;
  question: string;
  answer: string;
  service_id: string | null;
  sort_order: number;
};
export type ArticlePublic = {
  id: string;
  slug: string;
  title: string;
  body: string;
  image_media_id: string | null;
  published_at: string | null;
};
