import { FilterTabs, type FilterTab } from '../../../../components/admin/FilterTabs';

export type CareScreenLink = { value: string; label: string; path: string };

/** Accessible keyboard-operable care screen navigation using the shared filter-tab system. */
export function CareScreenNav({
  links,
  active,
  onChange,
}: {
  links: readonly CareScreenLink[];
  active: string;
  onChange: (path: string) => void;
}) {
  const tabs: FilterTab[] = links.map(({ value, label }) => ({ value, label }));
  return (
    <FilterTabs
      tabs={tabs}
      value={active}
      label="Care screens"
      onChange={(value) => {
        const target = links.find((link) => link.value === value);
        if (target) onChange(target.path);
      }}
      className="care-screen-tabs"
    />
  );
}
