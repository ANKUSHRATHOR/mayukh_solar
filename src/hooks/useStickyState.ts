import { useEffect, useState } from 'react';

/**
 * Persisted React state. Survives page reloads, tab switches, and
 * (where the browser keeps localStorage) app restarts.
 *
 * Use a stable, scoped key like "admin-attendance:month".
 */
export function useStickyState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return initialValue;
      return JSON.parse(raw) as T;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [key, value]);

  return [value, setValue] as const;
}
