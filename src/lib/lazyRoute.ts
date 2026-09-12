import { lazy, type ComponentType } from 'react';

/**
 * Loading a route chunk that the deploy has since replaced.
 *
 * Every page in `App.tsx` is `import()`ed on demand, and each chunk's filename
 * carries a content hash — `UserManagementPage-CnP4xo5u.js`. A deploy rewrites
 * those hashes and Vercel stops serving the old ones. A tab that was opened
 * before the deploy still holds the *previous* `index.html` in memory, so the
 * first navigation afterwards asks for a file that no longer exists and the
 * import rejects with "Failed to fetch dynamically imported module". Nothing is
 * broken — the tab is simply running last week's app against this week's server.
 *
 * The only repair is to fetch the new `index.html`, which means reloading. The
 * user never needed to see the error, so they don't: we reload for them, once,
 * and let React render the page from the new bundle.
 *
 * Reloading in response to a failed load is a loop waiting to happen — if the
 * chunk is missing for some *other* reason (an incomplete deploy, an offline
 * phone), the reload fails the same way forever. The session-scoped stamp caps
 * it at one reload per window, after which the error reaches `ErrorBoundary`,
 * which names the situation rather than showing the raw message.
 */

const RELOAD_STAMP_KEY = 'mayukh:chunk-reload-at';
const RELOAD_PARAM = 'build';
const RELOAD_WINDOW_MS = 30_000;

/**
 * Browsers word this failure differently — Chrome and Safari blame the fetch,
 * Firefox the module script — and older bundlers said "Loading chunk N failed".
 * All four mean the same thing here.
 */
const STALE_CHUNK_MESSAGE =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading chunk \S+ failed|loading css chunk/i;

export const isStaleChunkError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String((error as any)?.message ?? '');
  return STALE_CHUNK_MESSAGE.test(message);
};

/** True when we have not already reloaded for this in the last window. */
const claimReload = (): boolean => {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_STAMP_KEY) ?? 0);
    if (Number.isFinite(last) && Date.now() - last < RELOAD_WINDOW_MS) return false;
    window.sessionStorage.setItem(RELOAD_STAMP_KEY, String(Date.now()));
  } catch {
    // Private mode and locked-down webviews throw on sessionStorage. Losing the
    // guard is worse than losing the reload, so don't reload without it.
    return false;
  }
  return true;
};

const reloadForNewBuild = () => {
  // `true` is ignored by modern browsers, so bypass the HTTP cache the portable
  // way: navigate to the same URL with a one-shot query parameter.
  const url = new URL(window.location.href);
  url.searchParams.set(RELOAD_PARAM, String(Date.now()));
  window.location.replace(url.toString());
};

/**
 * `React.lazy`, but a chunk missing because the deploy moved on reloads instead
 * of erroring. Any other failure is rethrown untouched.
 */
export function lazyRoute<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      if (!isStaleChunkError(error) || !claimReload()) throw error;
      reloadForNewBuild();
      // The navigation replaces this document; never resolving keeps the
      // fallback spinner up instead of flashing an error on the way out.
      return new Promise<{ default: T }>(() => {});
    }
  });
}

/**
 * Vite preloads a route's dependency chunks alongside the route itself, and a
 * stale one fails there first — before `lazyRoute` is ever reached. Left alone
 * it surfaces as an unhandled rejection; handled, it is the same stale deploy.
 */
export const installChunkReloadHandler = () => {
  // The cache-buster has done its job by the time the new document runs; drop
  // it so it is not carried into every link, bookmark and shared URL after.
  const url = new URL(window.location.href);
  if (url.searchParams.has(RELOAD_PARAM)) {
    url.searchParams.delete(RELOAD_PARAM);
    window.history.replaceState(window.history.state, '', url.toString());
  }

  window.addEventListener('vite:preloadError', (event) => {
    if (!claimReload()) return;
    event.preventDefault();
    reloadForNewBuild();
  });
};
