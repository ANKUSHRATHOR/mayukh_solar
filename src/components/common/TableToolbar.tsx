import { ReactNode, useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import FiltersPopover from '@/components/dashboard/FiltersPopover';
import { cn } from '@/lib/utils';
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
 *
 * Below `sm` the whole bar is a single row: search collapses to an icon, so a
 * full-width field plus a button row no longer eats two lines of a phone screen
 * before any data appears. Tapping the icon expands the field across the row
 * with a Cancel beside it.
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

  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // A live search term never hides behind a collapsed icon — that is exactly the
  // "filter applied with no visible control" trap this component exists to
  // prevent. So the field stays open for as long as there is a term, and
  // Cancel clears it rather than concealing it.
  const expanded = searchOpen || Boolean(search);

  const openSearch = () => {
    setSearchOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const cancelSearch = () => {
    setSearch('');
    setSearchOpen(false);
  };

  return (
    <div className="flex items-center gap-2 sm:gap-2.5 sm:justify-between">
      <div className={cn('relative flex-1 sm:block sm:max-w-sm', !expanded && 'hidden')}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-11 pl-9 pr-9 text-base sm:h-9 sm:text-sm"
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

      <div className={cn('flex flex-wrap items-center gap-2', expanded && 'hidden sm:flex')}>
        {/* The phone's search affordance. Above sm the field itself is always
            visible, so this would be a second way to do the same thing. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openSearch}
          aria-label={searchPlaceholder}
          className="h-11 w-11 shrink-0 border-border bg-card p-0 hover:bg-accent/40 sm:hidden"
        >
          <Search className="h-4 w-4" />
        </Button>

        {filters && (
          <FiltersPopover activeCount={activeFilterCount} onClear={onClearFilters ?? (() => {})}>
            {filters}
          </FiltersPopover>
        )}
        {actions}
      </div>

      {expanded && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={cancelSearch}
          className="h-11 shrink-0 px-2 text-xs font-semibold sm:hidden"
        >
          Cancel
        </Button>
      )}
    </div>
  );
}

export default TableToolbar;
