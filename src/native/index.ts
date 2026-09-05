/**
 * Capacitor shell wiring.
 *
 * The web app is the single source of truth; everything native lives in this
 * folder and is entered from exactly one call in `src/main.tsx`. Every side
 * effect is gated on `isNative()`, so importing this from the browser build is
 * a no-op and the PWA is unaffected.
 *
 * Deliberately out of scope for this pass: push notifications and camera. Both
 * slot in here as additional `init*` modules without touching app code.
 */
import { App } from '@capacitor/app';

import { supabase } from '@/integrations/supabase/client';

import { initBackButton } from './backButton';
import { initDeepLinks } from './deepLink';
import { initNetwork } from './network';
import { isNative } from './platform';
import { initSafeArea } from './safeArea';
import { initSplash } from './splash';
import { initStatusBar } from './statusBar';

export { isNative, nativePlatform } from './platform';
export { NATIVE_AUTH_REDIRECT } from './authRedirect';

/**
 * Wires up native chrome and lifecycle. Returns a teardown function; the app
 * never calls it, but it keeps each module testable and HMR-safe.
 */
export const initNative = (): (() => void) => {
  if (!isNative()) return () => {};

  const teardowns = [
    initSafeArea(),
    initStatusBar(),
    initSplash(),
    initNetwork(),
    initBackButton(),
    initDeepLinks(),
  ];

  // supabase-js drives its refresh timer off `visibilitychange`, which a
  // backgrounded WebView does not fire reliably. Tie it to the real app
  // lifecycle instead so a session cannot silently expire while the app sits in
  // the background — this is the documented Capacitor/React Native recipe and
  // it only starts and stops the existing timer, it does not touch the session.
  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  }).then((handle) => {
    teardowns.push(() => void handle.remove());
  });

  return () => {
    for (const teardown of teardowns) teardown();
  };
};
