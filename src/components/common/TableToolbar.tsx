import { ReactNode } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import FiltersPopover from '@/components/dashboard/FiltersPopover';
import type { ServerTable } from '@/hooks/useServerTable';

interface TableToolbarProps<T> {
  table: ServerTable<T>;
  searchPlaceholder?: string;
  /** Filter controls, rendered inside the popover. */
  filters?: ReactNode;
  /** Number of filters currently applied — drives the badge on the button. */
  activeFilterCount?: number;
  onClearFilters?: () => void;
  /** Export buttons, "New" button, bulk actions. */
  actions?: ReactNode;
}

/**
 * Search + filters + actions bar above a `DataTable`.
 *
 * Filters are only rendered when `filters` is supplied — a deliberate guard
 * against the situation this codebase already had, where four filters were
 * persisted and applied but had no UI control, silently hiding rows.
 */
function TableToolbar<T>({
  table,
  searchPlaceholder = 'Search…',
  filters,
  activeFilterCount = 0,
  onClearFilters,
  actions,
}: TableToolbarProps<T>) {
  const { search, setSearch, isFetching, isSearching } = table;

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 pl-9 pr-9 text-sm"
          aria-label={searchPlaceholder}
        />
        {isSearching && isFetching ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <X className="h-4 w-4" />
            </button>
          )
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filters && (
          <FiltersPopover activeCount={activeFilterCount} onClear={onClearFilters ?? (() => {})}>
            {filters}
          </FiltersPopover>
        )}
        {actions}
      </div>
    </div>
  );
}

export default TableToolbar;
