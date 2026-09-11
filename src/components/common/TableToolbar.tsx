import { ReactNode, useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import FiltersPopover from '@/components/dashboard/FiltersPopover';
import ViewToggle, { type TableView } from '@/components/common/ViewToggle';
import { cn } from '@/lib/utils';
import type { ServerTable } from '@/hooks/useServerTable';

/** One choice in the view dropdown — a lead stage, a project type, a payment tab. */
export interface ToolbarView {
  value: string;
  label: string;
  /** Rendered as a tally beside the label. Omit when there is nothing to count. */
  count?: number;
}

interface TableToolbarProps<T> {
  table: ServerTable<T>;
  searchPlaceholder?: string;
  /**
   * The list's subsets. Rendered as a dropdown at the head of the row — see the
   * note on the component below for why this is not a tab strip.
   */
  views?: ToolbarView[];
  activeView?: string;
  onViewChange?: (value: string) => void;
  /** Names what the dropdown selects, for screen readers. */
  viewsLabel?: string;
  /** Table or cards. Omit both to leave the choice to `DataTable`'s `auto`. */
  layout?: TableView;
  onLayoutChange?: (value: TableView) => void;
  /** Filter controls, rendered inside the popover. */
  filters?: ReactNode;
  /** Number of filters currently applied — drives the badge on the button. */
  activeFilterCount?: number;
  onClearFilters?: () => void;
  /** Export buttons, "New" button, bulk actions. */
  actions?: ReactNode;
}

/**
 * Search + views + filters + actions bar above a `DataTable`. One row, at every
 * width.
 *
 * The subsets are a **dropdown, not a tab strip**. A strip has to show every
 * choice at once, so nine lead stages with their tallies overflowed into a
 * sideways-scrolling band that hid its own last few options, cost a full row
 * above the data, and put the least-used stage at the same visual weight as
 * "All". A dropdown states the current subset and its count in one control, and
 * costs the same width whether there are three choices or nine — so the whole
 * chrome above the first record is this single row.
 *
 * Filters are only rendered when `filters` is supplied — a deliberate guard
 * against the situation this codebase already had, where four filters were
 * persisted and applied but had no UI control, silently hiding rows.
 *
 * Below `sm` search collapses to an icon, so a full-width field plus a button
 * row no longer eats two lines of a phone screen before any data appears.
 * Tapping the icon expands the field across the row with a Cancel beside it.
 */
function TableToolbar<T>({
  table,
  searchPlaceholder = 'Search…',
  views,
  activeView,
  onViewChange,
  viewsLabel = 'View',
  layout,
  onLayoutChange,
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

  const showViews = Boolean(views?.length && onViewChange);

  return (
    <div className="flex items-center gap-2 sm:gap-2.5">
      {showViews && (
        <Select value={activeView} onValueChange={onViewChange}>
          <SelectTrigger
            aria-label={viewsLabel}
            className={cn(
              'h-10 w-auto min-w-[9.5rem] max-w-[13rem] shrink-0 gap-2 text-sm font-semibold sm:h-9',
              expanded && 'hidden sm:flex'
            )}
          >
            <SelectValue placeholder={viewsLabel} />
          </SelectTrigger>
          <SelectContent>
            {views!.map((v) => (
              <SelectItem key={v.value} value={v.value}>
                <span className="flex items-center gap-2">
                  {v.label}
                  {typeof v.count === 'number' && (
                    // The tally is half of what this control says — "which subset"
                    // and "how many are in it". As muted-on-muted at 10px it
                    // measured 4.34:1, under this design system's floor and the
                    // faintest thing in a toolbar of otherwise solid controls.
                    <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-foreground">
                      {v.count}
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className={cn('relative flex-1 sm:max-w-sm', !expanded && 'hidden sm:block')}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-10 pl-9 pr-9 text-base sm:h-9 sm:text-sm"
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

      <div
        className={cn(
          'ml-auto flex shrink-0 items-center gap-2',
          expanded && 'hidden sm:flex'
        )}
      >
        {/* The phone's search affordance. Above sm the field itself is always
            visible, so this would be a second way to do the same thing. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openSearch}
          aria-label={searchPlaceholder}
          className="h-10 w-10 shrink-0 border-border bg-card p-0 hover:bg-accent/40 sm:hidden"
        >
          <Search className="h-4 w-4" />
        </Button>

        {filters && (
          <FiltersPopover activeCount={activeFilterCount} onClear={onClearFilters ?? (() => {})}>
            {filters}
          </FiltersPopover>
        )}
        {actions}
        {layout && onLayoutChange && <ViewToggle view={layout} onChange={onLayoutChange} />}
      </div>

      {expanded && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={cancelSearch}
          className="h-10 shrink-0 px-2 text-xs font-semibold sm:hidden"
        >
          Cancel
        </Button>
      )}
    </div>
  );
}

export default TableToolbar;
