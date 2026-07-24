import { useEffect } from 'react';

/**
 * Warns before a full page unload while a form has unsaved edits.
 *
 * Scope note: this covers reloads, tab closes and external navigation. It does
 * NOT block in-app route changes — React Router's `useBlocker` requires a data
 * router (`createBrowserRouter`), and this app mounts a plain `<BrowserRouter>`.
 * In-app navigation away from a dirty form is guarded by the confirm dialog in
 * `FormShell`'s cancel path instead.
 */
export function useUnsavedChangesWarning(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Required by older browsers; modern ones show their own generic message.
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [enabled]);
}
