import type { ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { FilterBar, filterBarGrow } from './FilterBar';

interface SearchBarProps {
  /** Accessible name for the whole search form. */
  label: string;
  /** Label above the search box. */
  searchLabel: string;
  buttonLabel: string;
  placeholder?: string;
  /** The applied query. A new value resets the box, so "clear filters" empties it. */
  value: string;
  maxLength?: number;
  /** Called with the trimmed text when the person presses Enter or the button. */
  onSearch: (query: string) => void;
  /** Other filters that belong with the search, such as a service select. */
  children?: ReactNode;
  framed?: boolean;
  name?: string;
}

/**
 * Search box and its button, plus any other filters, in one aligned FilterBar.
 * The box is uncontrolled so typing does not refetch; it applies on submit.
 */
export function SearchBar({
  label,
  searchLabel,
  buttonLabel,
  placeholder,
  value,
  maxLength = 80,
  onSearch,
  children,
  framed = true,
  name = 'q',
}: SearchBarProps) {
  return (
    <FilterBar
      role="search"
      label={label}
      framed={framed}
      onSubmit={(event) => {
        const typed = new FormData(event.currentTarget).get(name);
        onSearch(typeof typed === 'string' ? typed.trim() : '');
      }}
      actions={<Button type="submit">{buttonLabel}</Button>}
    >
      <Field
        key={value}
        type="search"
        name={name}
        label={searchLabel}
        placeholder={placeholder}
        defaultValue={value}
        maxLength={maxLength}
        className={filterBarGrow}
      />
      {children}
    </FilterBar>
  );
}
