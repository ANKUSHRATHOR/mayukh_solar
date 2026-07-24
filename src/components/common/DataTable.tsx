import { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronRight, LucideIcon } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';
import type { ServerTable } from '@/hooks/useServerTable';

export interface DataTableColumn<T> {
  /** Stable identifier, also used as the React key. */
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /**
   * Database column to order by. Providing this makes the header clickable.
   * Omit for computed or joined columns that the server can't sort.
   */
  sortKey?: string;
  align?: 'left' | 'center' | 'right';
  /** Hide below this breakpoint on the desktop table. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  headerClassName?: string;
  /**
   * Mobile card role. `title` and `subtitle` render at the top of the card;
   * every other column becomes a label/value row. `hidden` omits it entirely.
   */
  mobile?: 'title' | 'subtitle' | 'row' | 'hidden';
}

interface DataTableProps<T> {
  table: ServerTable<T>;
  columns: DataTableColumn<T>[];
  /** Stable row identity. */
  rowKey: (row: T) => string;
  /** Makes rows clickable — use for "open detail". */
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  emptyAction?: ReactNode;
  className?: string;
}

const hideBelowClasses: Record<NonNullable<DataTableColumn<any>['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};

const alignClasses = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const;

/**
 * Paginated, sortable list view backed by `useServerTable`.
 *
 * Renders a real table on desktop and a stacked card list below `md`. The card
 * fallback matters here: field staff work on phones, and the app's existing
 * lists put 7–9 column tables inside a horizontal scroller, so the Actions
 * column sat off-screen.
 */
function DataTable<T>({
  table,
  columns,
  rowKey,
  onRowClick,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyIcon,
  emptyAction,
  className,
}: DataTableProps<T>) {
  const { rows, isLoading, isFetching, error, refetch, sort, toggleSort, isSearching } = table;

  if (error) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  if (isLoading) {
    return <LoadingRows columns={columns} />;
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title={isSearching ? 'No matches' : emptyTitle}
        description={
          isSearching
            ? 'No records match your search. Try a different term or clear the filters.'
            : emptyDescription
        }
        icon={emptyIcon}
        action={isSearching ? undefined : emptyAction}
      />
    );
  }

  const visibleOnMobile = columns.filter((c) => c.mobile !== 'hidden');
  const titleColumn = visibleOnMobile.find((c) => c.mobile === 'title') ?? visibleOnMobile[0];
  const subtitleColumn = visibleOnMobile.find((c) => c.mobile === 'subtitle');
  const detailColumns = visibleOnMobile.filter(
    (c) => c !== titleColumn && c !== subtitleColumn
  );

  return (
    <div className={cn('relative', className)}>
      {/* Dim during background refetches so paging reads as "loading" without
          tearing the current page down. */}
      <div className={cn('transition-opacity', isFetching && 'pointer-events-none opacity-60')}>
        {/* Desktop */}
        <div className="hidden overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-card md:block">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 bg-muted/50 hover:bg-muted/50">
                {columns.map((col) => {
                  const sortable = Boolean(col.sortKey);
                  const active = sortable && sort.column === col.sortKey;
                  return (
                    <TableHead
                      key={col.id}
                      className={cn(
                        'h-11 whitespace-nowrap text-[11px] font-bold uppercase tracking-wider text-muted-foreground',
                        alignClasses[col.align ?? 'left'],
                        col.hideBelow && hideBelowClasses[col.hideBelow],
                        col.headerClassName
                      )}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col.sortKey!)}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                            active && 'text-foreground'
                          )}
                          aria-label={`Sort by ${col.header}`}
                        >
                          {col.header}
                          {active ? (
                            sort.direction === 'asc' ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        col.header
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-border/50 transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-accent/40'
                  )}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.id}
                      className={cn(
                        'px-4 py-3 text-sm',
                        alignClasses[col.align ?? 'left'],
                        col.hideBelow && hideBelowClasses[col.hideBelow],
                        col.className
                      )}
                    >
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile */}
        <div className="space-y-2.5 md:hidden">
          {rows.map((row) => (
            <div
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              className={cn(
                'rounded-2xl border border-border/70 bg-card p-4 shadow-card',
                onRowClick &&
                  'cursor-pointer transition-colors hover:bg-accent/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-foreground">
                    {titleColumn?.cell(row)}
                  </div>
                  {subtitleColumn && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {subtitleColumn.cell(row)}
                    </div>
                  )}
                </div>
                {onRowClick && (
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </div>

              {detailColumns.length > 0 && (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-border/50 pt-3">
                  {detailColumns.map((col) => (
                    <div key={col.id} className="min-w-0">
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {col.header}
                      </dt>
                      <dd className="mt-0.5 break-words text-xs text-foreground">
                        {col.cell(row)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const LoadingRows = <T,>({ columns }: { columns: DataTableColumn<T>[] }) => (
  <div>
    <div className="hidden overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card md:block">
      <div className="flex gap-4 border-b border-border/60 px-4 py-3">
        {columns.map((col) => (
          <Skeleton key={col.id} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-border/40 px-4 py-4 last:border-0">
          {columns.map((col) => (
            <Skeleton key={col.id} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
    <div className="space-y-2.5 md:hidden">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border/70 bg-card p-4 shadow-card">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/3" />
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border/50 pt-3">
            <Skeleton className="h-3" />
            <Skeleton className="h-3" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default DataTable;
