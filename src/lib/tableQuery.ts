import type { SortState, TableQueryParams, TablePage } from '@/hooks/useServerTable';

/**
 * Helpers for turning `useServerTable` params into Supabase queries.
 * Keeps the `.range()`/`.order()`/`.or()` plumbing out of every module page.
 */

/**
 * Builds a PostgREST `or(...)` filter matching `term` against several columns.
 *
 * Commas and parentheses are stripped rather than escaped: PostgREST's filter
 * grammar uses both as delimiters and offers no escape sequence, so a term
 * containing them would otherwise be parsed as extra conditions.
 */
export const buildSearchFilter = (term: string, columns: string[]): string | null => {
  const safe = term.trim().replace(/[,()*]/g, ' ').trim();
  if (!safe || columns.length === 0) return null;
  return columns.map((col) => `${col}.ilike.%${safe}%`).join(',');
};

/** Applies sort and range to a Supabase query builder. */
export const applyPaging = <Q extends {
  order: (column: string, opts: { ascending: boolean; nullsFirst?: boolean }) => Q;
  range: (from: number, to: number) => Q;
}>(
  query: Q,
  { from, to, sort }: Pick<TableQueryParams, 'from' | 'to' | 'sort'>
): Q =>
  query
    .order(sort.column, { ascending: sort.direction === 'asc', nullsFirst: false })
    .range(from, to);

/**
 * Normalises a Supabase `{ data, error, count }` response into a `TablePage`.
 * Throws on error so react-query surfaces it — several existing pages drop the
 * error and render "no records", making a failure look like empty data.
 */
export const toTablePage = <T>(result: {
  data: T[] | null;
  error: { message: string } | null;
  count: number | null;
}): TablePage<T> => {
  if (result.error) throw new Error(result.error.message);
  return { rows: result.data ?? [], total: result.count ?? 0 };
};

export const defaultSort = (column: string, direction: 'asc' | 'desc' = 'desc'): SortState => ({
  column,
  direction,
});
