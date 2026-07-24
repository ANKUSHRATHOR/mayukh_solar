import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ServerTable } from '@/hooks/useServerTable';

interface TablePaginationProps<T> {
  table: ServerTable<T>;
  /** Plural noun for the count line, e.g. "quotations". */
  entityLabel?: string;
  pageSizeOptions?: number[];
}

/**
 * Page controls for a `DataTable`. Shows the true server-side total, so users
 * can see how much data exists rather than just what was loaded.
 */
function TablePagination<T>({
  table,
  entityLabel = 'records',
  pageSizeOptions = [25, 50, 100],
}: TablePaginationProps<T>) {
  const { page, pageCount, pageSize, setPage, setPageSize, total, rows } = table;

  if (total === 0) return null;

  const firstRow = page * pageSize + 1;
  const lastRow = page * pageSize + rows.length;
  const onFirst = page === 0;
  const onLast = page >= pageCount - 1;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        Showing <span className="font-semibold text-foreground">{firstRow}</span>–
        <span className="font-semibold text-foreground">{lastRow}</span> of{' '}
        <span className="font-semibold text-foreground">{total.toLocaleString('en-IN')}</span>{' '}
        {entityLabel}
      </p>

      <div className="flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
          <SelectTrigger className="h-8 w-[110px] text-xs" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={String(size)} className="text-xs">
                {size} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={onFirst}
            onClick={() => setPage(0)}
            aria-label="First page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={onFirst}
            onClick={() => setPage(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <span className="px-2 text-xs font-medium tabular-nums text-muted-foreground">
            {page + 1} / {pageCount}
          </span>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={onLast}
            onClick={() => setPage(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={onLast}
            onClick={() => setPage(pageCount - 1)}
            aria-label="Last page"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default TablePagination;
