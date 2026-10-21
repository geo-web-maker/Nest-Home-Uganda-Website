// TODO(gen-types): replace with generated types
export type ActivityItem = {
  id: string;
  at: string;
  user_name: string | null;
  action: string;
  item_type: string;
  item_label: string | null;
};
export type ActivityPage = {
  items: ActivityItem[];
  total: number;
  page: number;
  page_size: number;
};
