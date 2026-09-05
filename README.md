# Mayukh Solar CRM

Copy of the original app with a Node/Express backend added. Same frontend, same
Supabase database. The frontend also ships as a PWA and as a Capacitor native
shell for Android and iOS — see [Mobile app](#mobile-app-capacitor).

## Architecture

- **Frontend** (`src/`) — React + Vite + shadcn/ui. Unchanged, and still talks to
  Supabase directly for CRUD, auth, storage and realtime. RLS remains the
  security boundary for all of that.
- **Backend** (`server/`) — Express API holding the Supabase service-role key.
  It serves the privileged operations that previously ran as Supabase Edge
  Functions. See [server/README.md](server/README.md) for the route table.
- **Database** — the same Supabase project as the original app. No schema
  changes; `supabase/migrations/` is carried over as-is.

The frontend reaches the backend through `src/lib/apiClient.ts`, which returns
the same `{ data, error }` shape `supabase.functions.invoke` did.

## Running locally

Two terminals.

```bash
cd server && npm install && npm run dev
```

```bash
npm install && npm run dev
```

The Vite dev server proxies `/api/*` to `http://localhost:8787`, so no CORS
setup is needed in development.

Before the backend will start, set `SUPABASE_SERVICE_ROLE_KEY` in `server/.env`.

## Deploying

Deploy `server/` anywhere that runs Node (Railway, Render, Fly, a VM). Then set
`VITE_API_URL` in the frontend `.env` to that server's public origin and rebuild.

## Mobile app (Capacitor)

The native app is a **thin shell**: it loads the deployed web app in a WebView,
so the web app stays the single source of truth and a Vercel deploy reaches
phones without rebuilding or resubmitting a binary. All shell code lives in
[`src/native/`](src/native) and is entered from one call in `src/main.tsx`;
everything in it is a no-op outside the native runtime, so the browser and the
PWA are unaffected.

| | |
|---|---|
| App ID | `in.mayukhsolar.crm` |
| App name | Mayukh Solar |
| Config | [`capacitor.config.ts`](capacitor.config.ts) |
| Deploy targets | [`capacitor.environments.json`](capacitor.environments.json) |
| Native projects | `android/`, `ios/` — generated, committed |

### One-time setup

Capacitor 8 needs **Node ≥ 22** and **JDK 21** — the versions the web build uses
are not enough.

```bash
nvm install 22 && nvm use 22
brew install openjdk@21
```

For Android also install Android Studio (SDK platform 36, build-tools) and
export `ANDROID_HOME=$HOME/Library/Android/sdk`. For iOS install the full
**Xcode** (Command Line Tools alone cannot build or run the app). Capacitor 8
uses Swift Package Manager, so there are no CocoaPods to install.

> **Before your first build:** fill in the real hostnames in
> `capacitor.environments.json`. The config refuses to build while the
> `REPLACE-ME` placeholders are there, and refuses plain `http://` unless you
> explicitly pass `CAP_ALLOW_CLEARTEXT=1`.

### Rebuild the web app and sync into native

`cap:sync` runs `vite build`, stamps the selected URL into the bundled offline
page, and copies both into the native projects. Run it after **any** web change
you want reflected in a native build.

```bash
npm run cap:sync            # production
npm run cap:sync:staging    # staging
npm run cap:sync:dev        # local LAN dev server (allows http)
```

Under the hood every target is `CAP_ENV=<name>`, and `CAP_SERVER_URL=…`
overrides the URL ad hoc without editing the JSON:

```bash
CAP_SERVER_URL=https://my-branch.vercel.app npm run cap:sync
```

### Run

```bash
npm run cap:android         # sync, then build and run on a device/emulator
npm run cap:ios             # sync, then build and run on a simulator
npm run cap:open:android    # open the project in Android Studio
npm run cap:open:ios        # open the project in Xcode
```

Gradle directly, when you want the APK:

```bash
cd android && ./gradlew :app:assembleDebug
```

On an **emulator**, `localhost` on your Mac is `10.0.2.2` from inside Android:

```bash
CAP_SERVER_URL=http://10.0.2.2:8080 CAP_ALLOW_CLEARTEXT=1 npm run cap:sync
```

On a **physical device**, use your Mac's LAN IP (`ipconfig getifaddr en0`) —
that is what the `development` entry in `capacitor.environments.json` is for.

### Pointing the app at production vs staging

`server.url` is baked into the native project at sync time, not at runtime, so
switching environments means re-syncing and reinstalling:

```bash
npm run cap:sync:staging && npx cap run android   # QA build
npm run cap:sync         && npx cap run android   # production build
```

Always `npm run cap:sync` (production) before cutting a release build, or the
binary will ship pointing at staging.

The shell only chooses which *frontend* to load. Which Express backend that
frontend talks to is baked into the deployed bundle by `VITE_API_URL`, so a
staging shell reaches the staging API only if the staging deploy was built
against it — there is no separate switch on the native side.

### App icon and splash screen

The current artwork is a **placeholder** generated from
`src/assets/mayukh-solar-logo.png`. Drop final artwork into `assets/` and
regenerate:

| File | Size | Notes |
|---|---|---|
| `assets/icon.png` | 1024×1024 | App icon. Keep content inside the middle ~62% — Android masks it to a circle/squircle. |
| `assets/icon-foreground.png` | 1024×1024 | Android adaptive icon foreground, transparent background. |
| `assets/icon-background.png` | 1024×1024 | Android adaptive icon background, usually a flat colour. |
| `assets/splash.png` | 2732×2732 | Light-mode splash. Cropped hard on tall phones — keep the logo small and centred. |
| `assets/splash-dark.png` | 2732×2732 | Dark-mode splash. |

```bash
npx capacitor-assets generate --android --ios \
  --iconBackgroundColor '#f8fafb' --iconBackgroundColorDark '#0d1626' \
  --splashBackgroundColor '#f8fafb' --splashBackgroundColorDark '#0d1626'
```

Pass `--android --ios` as shown. Without them the generator also rewrites
`public/manifest.webmanifest` with broken relative icon paths and breaks the PWA.

### What the shell handles

- **Splash screen** — `launchAutoHide: false`, hidden from JS once the app has
  actually painted (`src/native/splash.ts`), so a slow remote load never flashes
  a blank screen. Hard cap of 10s.
- **Status bar** — follows the app's light/dark theme, reading the real
  `--background` token out of the live stylesheet rather than a second copy of
  the palette (`src/native/statusBar.ts`). Not overlaid, so the existing layout
  needs no top offset.
- **Android back button** (`src/native/backButton.ts`) — closes an open
  dialog/sheet/menu first, otherwise walks back through WebView history; on
  `/`, `/login` and `/set-password` it requires a confirming second press
  before exiting.
- **Safe areas** — the shell deliberately does *not* use `viewport-fit=cover`,
  so the platform keeps the page clear of the notch and gesture bar and nothing
  in the Tailwind layout can be clipped. `src/native/safeArea.ts` publishes the
  real insets as `--safe-area-inset-*` for when the layout wants to go
  edge-to-edge.
- **Offline** — two paths. A cold start with no network never reaches the remote
  origin and no app JS runs at all, so Capacitor serves the bundled
  [`public/offline.html`](public/offline.html) via `server.errorPath`; it polls
  and navigates back to the app on its own once connectivity returns. Losing
  connectivity mid-session is handled in JS by `src/native/network.ts`.

Out of scope for this pass, and designed to slot in as further `init*` modules
without touching app code: **push notifications** and **camera**.

### Auth and session persistence

Supabase stores its session in `localStorage`, not cookies, so none of the
third-party-cookie or storage-partitioning problems that bite cookie-based auth
in a WebView apply here. Verified on Android: `localStorage` written in the
WebView survives a full force-stop and relaunch, and `supabase.auth`
rehydrates from it.

Two things to know:

1. **Token refresh while backgrounded.** supabase-js drives its refresh timer
   off `visibilitychange`, which a backgrounded WebView does not fire reliably.
   `src/native/index.ts` ties `startAutoRefresh` / `stopAutoRefresh` to
   Capacitor's real `appStateChange` events instead.
2. **Google sign-in will not work in the WebView.** `Login.tsx` calls
   `signInWithOAuth` with `redirectTo: window.location.origin`, and Google
   blocks its OAuth flow inside embedded WebViews (`disallowed_useragent`) — the
   button is expected to fail in the native app while email/password and OTP
   work normally. The fix is to open the OAuth URL in the system browser
   (`@capacitor/browser`) and return via a deep link — add
   `in.mayukhsolar.crm://` (already registered as `custom_url_scheme`) to the
   Supabase redirect allow-list, then handle `appUrlOpen` and pass the code to
   `exchangeCodeForSession`. Not done in this pass because it needs a change to
   `Login.tsx`.

### Store submission

Apple applies guideline 4.2 ("minimum functionality") to apps that are mostly a
wrapper around a website. Since this ships to a known set of staff rather than
the general public, plan on **Apple Business Manager / custom app distribution**,
or add enough genuinely native capability (push, camera, offline data) that the
app is not just a web view. Worth deciding before you spend time on the
App Store listing.
