import { DataTable, type DataColumn, type DataTableLabels } from '../../../../components/admin/DataTable';

/** Care operations table adapter. Keeps the shared responsive table contract consistent. */
export function CareTable<T>({
  columns,
  rows,
  getRowKey,
  labels,
  loading = false,
  id,
}: {
  columns: readonly DataColumn<T>[];
  rows: readonly T[];
  getRowKey: (row: T) => string;
  labels: DataTableLabels;
  loading?: boolean;
  id?: string;
}) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={getRowKey}
      labels={labels}
      loading={loading}
      id={id}
    />
  );
}
