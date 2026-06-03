declare global {
  interface Window {
    __mayukhRefreshLocks?: Set<string>;
  }
}

function getLockSet() {
  if (!window.__mayukhRefreshLocks) {
    window.__mayukhRefreshLocks = new Set<string>();
  }
  return window.__mayukhRefreshLocks;
}

export function acquireRefreshLock(key: string) {
  const locks = getLockSet();
  locks.add(key);

  return () => {
    getLockSet().delete(key);
  };
}

export function hasActiveRefreshLock() {
  return getLockSet().size > 0;
}
