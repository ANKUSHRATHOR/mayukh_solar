import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor shell for the Mayukh Solar CRM.
 *
 * The web app remains the single source of truth: the native binary is a thin
 * WebView that loads the deployed site, so a Vercel deploy ships to the app
 * without rebuilding or resubmitting the binaries.
 *
 * `webDir` still points at the local production build because Capacitor serves
 * `server.errorPath` (offline.html) from it when the remote URL cannot be
 * reached — see `public/offline.html`. Keep `npm run build` current before
 * `npx cap sync` so that fallback page is up to date.
 */

/**
 * Deploy targets, kept in `capacitor.environments.json` so that both this
 * config and `scripts/sync-offline-url.mjs` read one copy. Select with CAP_ENV;
 * override ad hoc with CAP_SERVER_URL.
 *
 *   production  — the App Store / Play Store build
 *   staging     — Vercel preview, for QA on real devices
 *   development — your machine's LAN address running `npm run dev`
 */
// process.cwd() rather than import.meta.url: the Capacitor CLI transpiles this
// file to CommonJS before requiring it, and always runs from the project root.
const ENVIRONMENTS: Record<string, string> = JSON.parse(
  readFileSync(join(process.cwd(), 'capacitor.environments.json'), 'utf8'),
);

const envName = process.env.CAP_ENV ?? 'production';
if (!(envName in ENVIRONMENTS)) {
  throw new Error(
    `Unknown CAP_ENV "${envName}". Expected one of: ${Object.keys(ENVIRONMENTS).join(', ')}`,
  );
}

const serverUrl = process.env.CAP_SERVER_URL ?? ENVIRONMENTS[envName];

if (serverUrl.includes('REPLACE-ME')) {
  throw new Error(
    `capacitor.config.ts: the "${envName}" URL is still a placeholder. ` +
      'Edit capacitor.environments.json, or pass CAP_SERVER_URL=https://…',
  );
}

// Plain http is refused unless explicitly opted into, so a staging typo can
// never silently downgrade the app to an unencrypted origin.
const allowCleartext = process.env.CAP_ALLOW_CLEARTEXT === '1';
if (serverUrl.startsWith('http://') && !allowCleartext) {
  throw new Error(
    `capacitor.config.ts: refusing to load "${serverUrl}" over http. ` +
      'Use https, or set CAP_ALLOW_CLEARTEXT=1 for local LAN development only.',
  );
}

/** Brand orange (--primary, 21 90% 40%) — matches the PWA theme-color. */
const BRAND = '#BD4308';
/** Light --background (210 20% 98%). */
const SPLASH_BG = '#F8FAFB';

const config: CapacitorConfig = {
  appId: 'in.mayukhsolar.crm',
  appName: 'Mayukh Solar',
  webDir: 'dist',
  server: {
    url: serverUrl,
    cleartext: allowCleartext,
    // Served from the bundled webDir when the remote origin is unreachable,
    // instead of leaving the user staring at a blank WebView.
    errorPath: 'offline.html',
  },
  ios: {
    // Deliberately NOT using viewport-fit=cover. Without it WKWebView lays the
    // page out inside the safe area, so the notch and home indicator can never
    // clip the existing Tailwind layout — which knows nothing about insets.
    // The resulting bands take this colour; src/native/safeArea.ts publishes
    // the real inset values as CSS vars for when the layout does adopt them.
    backgroundColor: SPLASH_BG,
    contentInset: 'automatic',
  },
  android: {
    backgroundColor: SPLASH_BG,
    // Debug builds talk to a LAN dev server over http when opted in.
    allowMixedContent: allowCleartext,
  },
  plugins: {
    SplashScreen: {
      // Remote-loaded pages take a moment; hide the splash from JS once the
      // app has actually painted (src/native/splash.ts) rather than on a timer.
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: SPLASH_BG,
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      androidSpinnerStyle: 'large',
      iosSpinnerStyle: 'small',
      spinnerColor: BRAND,
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      // The web app draws its own header; keeping the bar out of the WebView
      // means the existing Tailwind layout needs no top offset on Android.
      overlaysWebView: false,
      // Style.LIGHT means *dark* content for a light background — the bar is
      // filled with the app's own --background token, not the accent, so the
      // one accent colour stays reserved for primary actions (DESIGN-SYSTEM.md).
      style: 'LIGHT',
      backgroundColor: SPLASH_BG,
    },
  },
};

export default config;
