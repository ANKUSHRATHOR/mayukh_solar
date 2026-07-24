import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import DataTable, { type DataTableColumn } from '@/components/common/DataTable';
import type { ServerTable } from '@/hooks/useServerTable';

interface Row {
  id: string;
  name: string;
  amount: number;
}

const rows: Row[] = [
  { id: '1', name: 'Ramesh Kumar', amount: 150000 },
  { id: '2', name: 'Sunita Devi', amount: 240000 },
];

const columns: DataTableColumn<Row>[] = [
  { id: 'name', header: 'Customer', sortKey: 'name', mobile: 'title', cell: (r) => r.name },
  {
    id: 'amount',
    header: 'Amount',
    sortKey: 'amount',
    align: 'right',
    cell: (r) => `₹${r.amount.toLocaleString('en-IN')}`,
  },
];

/** Builds a ServerTable stub; override only what a given test cares about. */
const makeTable = (overrides: Partial<ServerTable<Row>> = {}): ServerTable<Row> =>
  ({
    rows,
    total: rows.length,
    page: 0,
    pageCount: 1,
    pageSize: 25,
    setPage: vi.fn(),
    setPageSize: vi.fn(),
    search: '',
    setSearch: vi.fn(),
    isSearching: false,
    sort: { column: 'name', direction: 'asc' },
    setSort: vi.fn(),
    toggleSort: vi.fn(),
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  }) as unknown as ServerTable<Row>;

const renderTable = (overrides: Partial<ServerTable<Row>> = {}, props = {}) =>
  render(
    <DataTable
      table={makeTable(overrides)}
      columns={columns}
      rowKey={(r) => r.id}
      {...props}
    />
  );

describe('DataTable', () => {
  it('renders a row per record', () => {
    renderTable();
    expect(screen.getAllByText('Ramesh Kumar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sunita Devi').length).toBeGreaterThan(0);
  });

  it('renders both a desktop table and a mobile card list', () => {
    renderTable();
    // Both layouts are in the DOM; CSS picks one. Each row therefore appears
    // twice, which is what the duplicate-count assertions below rely on.
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByText('Ramesh Kumar')).toHaveLength(2);
  });

  it('shows a sort control only for sortable columns', () => {
    render(
      <DataTable
        table={makeTable()}
        columns={[...columns, { id: 'note', header: 'Note', cell: () => 'x' }]}
        rowKey={(r) => r.id}
      />
    );
    expect(screen.getByRole('button', { name: 'Sort by Customer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sort by Note' })).not.toBeInTheDocument();
  });

  it('asks the server to re-sort when a header is clicked', () => {
    const toggleSort = vi.fn();
    renderTable({ toggleSort });

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Amount' }));
    expect(toggleSort).toHaveBeenCalledWith('amount');
  });

  it('calls onRowClick with the clicked record', () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        table={makeTable()}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={onRowClick}
      />
    );

    const table = screen.getByRole('table');
    fireEvent.click(within(table).getByText('Sunita Devi'));
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  it('shows skeletons while loading, not an empty state', () => {
    renderTable({ isLoading: true, rows: [] });
    expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // An error must not look like "no data" — that ambiguity is exactly what the
  // existing pages get wrong.
  it('shows the error and a retry when the fetch failed', () => {
    const refetch = vi.fn();
    renderTable({ error: new Error('RLS denied'), rows: [], refetch });

    expect(screen.getByText('RLS denied')).toBeInTheDocument();
    expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows the empty state when there are genuinely no rows', () => {
    renderTable({ rows: [], total: 0 });
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('distinguishes "no search matches" from "no records"', () => {
    renderTable({ rows: [], total: 0, isSearching: true });
    expect(screen.getByText('No matches')).toBeInTheDocument();
    expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument();
  });

  it('hides the create action when a search returns nothing', () => {
    renderTable(
      { rows: [], total: 0, isSearching: true },
      { emptyAction: <button type="button">Add record</button> }
    );
    // Offering "Add record" when a filter simply matched nothing is misleading.
    expect(screen.queryByRole('button', { name: 'Add record' })).not.toBeInTheDocument();
  });
});
