import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { cx } from '../../lib/cx';
import styles from './FilterTabs.module.css';

export interface FilterTab {
  value: string;
  label: string;
}

interface FilterTabsProps {
  tabs: readonly FilterTab[];
  value: string;
  onChange: (value: string) => void;
  /** Accessible name for the group, for example "Filter by status". */
  label: string;
  /** Id of the list region the tabs filter (becomes aria-controls on each tab). */
  controls?: string;
  className?: string;
}

/** Scrollable pill filters. One tab is in the tab order; arrow keys, Home and End move and select. */
export function FilterTabs({ tabs, value, onChange, label, controls, className }: FilterTabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (event: KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    const target = next === null ? undefined : tabs[next];
    if (next === null || !target) return;
    event.preventDefault();
    onChange(target.value);
    refs.current[next]?.focus();
  };

  // If the value matches no tab, the first tab stays reachable by keyboard.
  const selectedIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.value === value),
  );

  return (
    <div role="tablist" aria-label={label} className={cx(styles.tabs, className)}>
      {tabs.map((tab, index) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={controls}
            tabIndex={index === selectedIndex ? 0 : -1}
            className={cx(styles.tab, selected && styles.selected)}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => move(event, index)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
