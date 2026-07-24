import { useEffect, useState } from 'react';

/**
 * Delays propagating a rapidly-changing value. Used for search boxes so each
 * keystroke doesn't fire a server round-trip.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
