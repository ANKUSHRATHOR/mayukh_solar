// Refresh locks survive WebView restarts on mobile by being persisted to
// sessionStorage. The auto-refresh in main.tsx checks `hasActiveRefreshLock()`
// before reloading so an in-progress punch / upload is never interrupted.

const STORAGE_KEY = "mayukh-refresh-locks";

declare global {
  interface Window {
    __mayukhRefreshLocks?: Set<string>;
  }
}

function readPersisted(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function persist(set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    if (set.size === 0) window.sessionStorage.removeItem(STORAGE_KEY);
    else window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

function getLockSet() {
  if (!window.__mayukhRefreshLocks) {
    window.__mayukhRefreshLocks = readPersisted();
  }
  return window.__mayukhRefreshLocks;
}

export function acquireRefreshLock(key: string) {
  const locks = getLockSet();
  locks.add(key);
  persist(locks);

  return () => {
    const set = getLockSet();
    set.delete(key);
    persist(set);
  };
}

export function hasActiveRefreshLock() {
  return getLockSet().size > 0;
}

// Also treat any in-progress attendance draft as an active lock so background
// updates never reload the app while the user is mid-punch (even after the
// WebView restarted from a camera intent).
export function hasAttendanceDraft() {
  if (typeof window === "undefined") return false;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("attendance-draft:")) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
