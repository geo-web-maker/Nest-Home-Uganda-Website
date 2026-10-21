import type { MouseEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cx } from '../../lib/cx';
import styles from './DataTable.module.css';

export interface DataColumn<T> {
  key: string;
  /** Column heading. Below 1040px it is the `label:` prefix on each card line. */
  header: string;
  cell: (row: T) => ReactNode;
}

export interface DataTableLabels {
  /** Accessible name of the table. */
  caption: string;
  loading: string;
  empty: string;
}

interface DataTableProps<T> {
  /** The first column is the primary cell: bold, no prefix on a card, and the row link. */
  columns: readonly DataColumn<T>[];
  rows: readonly T[];
  getRowKey: (row: T) => string;
  /** When set, the row opens a detail screen: the primary cell is a link and the whole row is clickable. */
  getRowHref?: (row: T) => string;
  loading?: boolean;
  labels: DataTableLabels;
  id?: string;
}

const INTERACTIVE = 'a, button, input, select, textarea, label';

/**
 * Real table from 1040px, one card per row below (CSS only, one set of markup). Table roles are
 * explicit because the card layout changes `display`, which some browsers treat as dropping them.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  getRowHref,
  loading = false,
  labels,
  id,
}: DataTableProps<T>) {
  const navigate = useNavigate();
  const showLoading = loading && rows.length === 0;

  const open = (event: MouseEvent, href: string) => {
    if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
    navigate(href);
  };

  if (showLoading) {
    return (
      <div id={id} className={styles.state} aria-busy="true">
        <p role="status">{labels.loading}</p>
        <div className={styles.skeleton} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div id={id} className={styles.state}>
        <p>{labels.empty}</p>
      </div>
    );
  }

  return (
    <div id={id} className={styles.wrap} aria-busy={loading}>
      <table className={styles.table} role="table">
        <caption className={styles.caption}>{labels.caption}</caption>
        <thead className={styles.head} role="rowgroup">
          <tr role="row" className={styles.headRow}>
            {columns.map((column) => (
              <th key={column.key} role="columnheader" scope="col" className={styles.th}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup" className={styles.body}>
          {rows.map((row) => {
            const href = getRowHref?.(row);
            return (
              <tr
                key={getRowKey(row)}
                role="row"
                className={cx(styles.row, href && styles.clickable)}
                onClick={href ? (event) => open(event, href) : undefined}
              >
                {columns.map((column, index) => {
                  const content = column.cell(row);
                  const primary = index === 0;
                  return (
                    <td
                      key={column.key}
                      role="cell"
                      data-label={primary ? undefined : column.header}
                      className={cx(styles.cell, primary && styles.primary)}
                    >
                      {primary && href ? (
                        <Link to={href} className={styles.link}>
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
