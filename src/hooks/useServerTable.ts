import { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useStickyState } from '@/hooks/useStickyState';

export interface SortState {
  /** Database column to order by. */
  column: string;
  direction: 'asc' | 'desc';
}

export interface TableQueryParams {
  /** Inclusive start row index, for Supabase `.range(from, to)`. */
  from: number;
  /** Inclusive end row index. */
  to: number;
  /** Debounced search term; empty string when unused. */
  search: string;
  sort: SortState;
  /** Arbitrary module-specific filter values. */
  filters: Record<string, unknown>;
}

export interface TablePage<T> {
  rows: T[];
  /** Total matching rows on the server, for page count. Supabase returns this
   *  as `count` when you pass `{ count: 'exact' }` to `.select()`. */
  total: number;
}

interface UseServerTableOptions<T> {
  /** Stable prefix identifying the entity, e.g. `['quotations']`. */
  queryKey: readonly unknown[];
  fetchPage: (params: TableQueryParams) => Promise<TablePage<T>>;
  pageSize?: number;
  initialSort: SortState;
  filters?: Record<string, unknown>;
  /** localStorage key prefix; when set, page size and sort survive reloads. */
  persistKey?: string;
  enabled?: boolean;
}

/**
 * Server-side pagination, search and sort for list views.
 *
 * The app previously loaded every row and filtered in JavaScript — AdminLeadsList
 * issued six unbounded queries on mount and re-ran them on any realtime event.
 * This keeps the payload to one page regardless of table size.
 */
export function useServerTable<T>({
  queryKey,
  fetchPage,
  pageSize: initialPageSize = 25,
  initialSort,
  filters,
  persistKey,
  enabled = true,
}: UseServerTableOptions<T>) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  // Sort and page size persist; the page index and search deliberately do not,
  // so returning to a list starts at the top rather than mid-scroll.
  const [sort, setSort] = useStickyState<SortState>(
    persistKey ? `${persistKey}:sort` : '__table_sort_ephemeral',
    initialSort
  );
  const [pageSize, setPageSize] = useStickyState<number>(
    persistKey ? `${persistKey}:pageSize` : '__table_size_ephemeral',
    initialPageSize
  );

  // Serialised so the query key changes by value, not object identity.
  const filterKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);

  // Any change to what's being queried invalidates the current page index.
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, filterKey, pageSize, sort.column, sort.direction]);

  const query = useQuery({
    queryKey: [...queryKey, { page, pageSize, search: debouncedSearch, sort, filterKey }],
    queryFn: () =>
      fetchPage({
        from: page * pageSize,
        to: page * pageSize + pageSize - 1,
        search: debouncedSearch,
        sort,
        filters: filters ?? {},
      }),
    // Keeps the previous page visible while the next loads, so paging doesn't
    // flash an empty table.
    placeholderData: keepPreviousData,
    enabled,
  });

  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // A deletion can empty the last page; step back rather than showing "no rows".
  useEffect(() => {
    if (page > 0 && page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);

  const toggleSort = useCallback(
    (column: string) => {
      setSort((current) =>
        current.column === column
          ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
          : { column, direction: 'asc' }
      );
    },
    [setSort]
  );

  return {
    rows: query.data?.rows ?? [],
    total,
    page,
    pageCount,
    pageSize,
    setPage,
    setPageSize,
    search,
    setSearch,
    /** True once the debounce has settled and a search is actually applied. */
    isSearching: debouncedSearch.length > 0,
    sort,
    setSort,
    toggleSort,
    isLoading: query.isLoading,
    /** True during background refetches, including page changes. */
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

export type ServerTable<T> = ReturnType<typeof useServerTable<T>>;
