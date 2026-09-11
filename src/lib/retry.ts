/**
 * Retrying a Supabase read that failed for a reason that is not about the query.
 *
 * Every list page but one goes through `useServerTable`, so react-query's
 * default three attempts cover it. `AdminLeadsList` owns its query layer and
 * had no retry at all, which is why a backend wobble showed up there first as
 * "leads not loading" while Projects and Payments rode it out silently.
 *
 * The case that prompted this: a pooled connection left in `idle in transaction
 * (aborted)` answers `25P02` to whatever request it is handed next, while every
 * other connection serves normally. Roughly a third of requests failed, at
 * random, for a query that was not itself wrong. One retry takes a 30% failure
 * rate to ~10%, two to ~3%.
 *
 * Only failures that a *different connection or a moment later* could plausibly
 * answer are retried. A permission error, a bad column or a violated constraint
 * is the same answer every time, and retrying it just delays the error the user
 * needs to see.
 */

/** Postgres/PostgREST codes worth a second attempt. */
const RETRYABLE_CODES = new Set([
  '25P02', // transaction aborted — the connection is poisoned, not the query
  '08000', // connection exception
  '08003', // connection does not exist
  '08006', // connection failure
  '53300', // too many connections
  '57P01', // admin shutdown
  '57P02', // crash shutdown
  '57P03', // cannot connect now — server starting up
  '40001', // serialization failure
  '40P01', // deadlock detected
  'PGRST001', // PostgREST could not connect to the database
]);

/** A fetch that never reached the server, so nothing was executed twice. */
const isNetworkError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String((error as any)?.message ?? '');
  return /failed to fetch|networkerror|load failed|timeout/i.test(message);
};

export const isRetryable = (error: unknown): boolean => {
  if (!error) return false;
  const code = (error as any)?.code;
  if (typeof code === 'string' && RETRYABLE_CODES.has(code)) return true;
  // PostgREST surfaces the HTTP status on some error shapes; any 5xx is the
  // server failing to answer rather than refusing to.
  const status = Number((error as any)?.status ?? (error as any)?.statusCode);
  if (Number.isFinite(status) && status >= 500) return true;
  return isNetworkError(error);
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface RetryOptions {
  /** Total attempts including the first. */
  attempts?: number;
  /** First backoff step; doubles each attempt. */
  baseDelayMs?: number;
}

/**
 * Runs a Supabase query, retrying transient failures.
 *
 * `run` must *build* the query each time rather than closing over a builder:
 * a PostgrestBuilder executes once, so a retry has to start from a fresh one.
 * The `{ data, error }` result is returned as-is once it settles, so callers
 * keep their existing error handling.
 */
// The constraint is what lets this read `.error` without a cast. Where `run`
// returns `any` — the `(supabase as any)` casts this codebase uses for tables
// that postdate the last types.ts generation — TS collapses T to the constraint
// and `.data` disappears, so those few call sites name T explicitly.
export async function retryQuery<T extends { error: unknown }>(
  run: () => PromiseLike<T>,
  { attempts = 3, baseDelayMs = 250 }: RetryOptions = {},
): Promise<T> {
  let lastThrown: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await run();
      if (!result.error || !isRetryable(result.error) || attempt === attempts) return result;
    } catch (thrown) {
      // A thrown error is the network layer; the query never ran.
      if (!isRetryable(thrown) || attempt === attempts) throw thrown;
      lastThrown = thrown;
    }
    await wait(baseDelayMs * 2 ** (attempt - 1));
  }

  // Unreachable: the loop returns or throws on its final attempt.
  throw lastThrown;
}
