// TODO(gen-types): replace with generated types
export type PricingBlockPublic = {
  id: string;
  key: 'assessment' | 'quote' | 'plan';
  tag: string;
  title: string;
  text: string;
  price_text: string;
  sort_order: number;
};
