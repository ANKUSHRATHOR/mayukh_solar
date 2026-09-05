import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import type { PluginListenerHandle } from '@capacitor/core';

import { supabase } from '@/integrations/supabase/client';

import { NATIVE_AUTH_REDIRECT } from './authRedirect';
import { showToast } from './toast';

/**
 * Completes an OAuth sign-in that finished in the system browser.
 *
 * `Login.tsx` opens Google in a Chrome Custom Tab — Google rejects OAuth inside
 * an embedded WebView — and Supabase redirects back to NATIVE_AUTH_REDIRECT.
 * Android hands that URL to the app as an `appUrlOpen` event, and this module
 * turns the single-use code in it into a session.
 *
 * The PKCE verifier was written to this WebView's localStorage when Login.tsx
 * built the authorize URL, so the exchange has to happen here, in the same
 * context — which is the whole reason the callback comes back to the app
 * instead of completing in the browser.
 */
const handleUrl = async (url: string) => {
  if (!url.startsWith(NATIVE_AUTH_REDIRECT)) return;

  // Close the Custom Tab first: the exchange is a network round trip, and
  // leaving the browser in front of the app reads as a hang.
  void Browser.close().catch(() => {});

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }

  // Supabase reports a refused or cancelled sign-in on the redirect itself.
  const error = parsed.searchParams.get('error_description') ?? parsed.searchParams.get('error');
  if (error) {
    showToast(error);
    return;
  }

  const code = parsed.searchParams.get('code');
  if (!code) {
    showToast('Sign-in did not complete. Please try again.');
    return;
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    // Supabase's messages here are written for developers — the PKCE one talks
    // about SSR frameworks and cookie storage. Field staff get something they
    // can act on; the real text goes to the console for debugging.
    console.error('OAuth code exchange failed', exchangeError);
    showToast('Could not complete Google sign-in. Please try again.');
    return;
  }

  // No navigation needed: onAuthStateChange in AuthContext fires on SIGNED_IN
  // and the role router at "/" takes it from there.
};

export const initDeepLinks = (): (() => void) => {
  let handle: PluginListenerHandle | undefined;

  void App.addListener('appUrlOpen', ({ url }) => {
    void handleUrl(url);
  }).then((listener) => {
    handle = listener;
  });

  // A cold start from a deep link delivers the URL through the launch intent
  // rather than an event, so the listener alone would miss it.
  void App.getLaunchUrl()
    .then((launch) => {
      if (launch?.url) void handleUrl(launch.url);
    })
    .catch(() => {});

  return () => {
    void handle?.remove();
  };
};
