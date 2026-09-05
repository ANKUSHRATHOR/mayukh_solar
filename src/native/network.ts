import { Network } from '@capacitor/network';
import type { PluginListenerHandle } from '@capacitor/core';

/**
 * In-session connectivity handling.
 *
 * The *cold start* offline case — the device has no network when the app opens,
 * so the remote origin never loads and no app JS runs at all — is handled by
 * Capacitor's `server.errorPath`, which serves the bundled `public/offline.html`
 * instead of a blank WebView. This module covers the other case: the app is
 * already running and connectivity drops underneath it.
 */
const OVERLAY_ID = 'native-shell-offline';

/** How long to wait before assuming a "connected" event is really usable. */
const RECONNECT_SETTLE_MS = 600;

const buildOverlay = (onRetry: () => void): HTMLElement => {
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-live', 'assertive');
  overlay.setAttribute('aria-label', 'No internet connection');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '24px',
    textAlign: 'center',
    background: 'hsl(var(--background, 210 20% 98%))',
    color: 'hsl(var(--foreground, 222 47% 11%))',
    font: '400 15px/1.55 system-ui, -apple-system, sans-serif',
  } satisfies Partial<CSSStyleDeclaration>);

  const icon = document.createElement('div');
  icon.textContent = '⚡';
  icon.style.fontSize = '40px';
  icon.setAttribute('aria-hidden', 'true');

  const title = document.createElement('h1');
  title.textContent = 'No internet connection';
  Object.assign(title.style, {
    margin: '0',
    font: '600 20px/1.3 system-ui, -apple-system, sans-serif',
  } satisfies Partial<CSSStyleDeclaration>);

  const body = document.createElement('p');
  body.textContent =
    'Mayukh Solar needs a connection to load your leads, visits and projects. We will reconnect automatically as soon as the network is back.';
  Object.assign(body.style, {
    margin: '0',
    maxWidth: '32ch',
    color: 'hsl(var(--muted-foreground, 215 16% 47%))',
  } satisfies Partial<CSSStyleDeclaration>);

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Try again';
  Object.assign(retry.style, {
    marginTop: '8px',
    minHeight: '44px',
    padding: '0 24px',
    border: '0',
    borderRadius: '8px',
    font: '600 15px/1 system-ui, -apple-system, sans-serif',
    background: 'hsl(var(--primary, 21 90% 40%))',
    color: 'hsl(var(--primary-foreground, 0 0% 100%))',
  } satisfies Partial<CSSStyleDeclaration>);
  retry.addEventListener('click', onRetry);

  overlay.append(icon, title, body, retry);
  return overlay;
};

export const initNetwork = (): (() => void) => {
  let overlay: HTMLElement | null = null;
  let settleTimer: number | undefined;

  const hide = () => {
    overlay?.remove();
    overlay = null;
  };

  const show = () => {
    if (overlay) return;
    overlay = buildOverlay(() => void refresh());
    document.body.appendChild(overlay);
  };

  const refresh = async () => {
    try {
      const { connected } = await Network.getStatus();
      if (connected) {
        hide();
        // The SPA may be holding failed queries; a reload is the cheapest way
        // to get back to a known-good state without touching app code.
        window.location.reload();
      }
    } catch {
      // Plugin unavailable — leave the overlay up; the listener still fires.
    }
  };

  let handle: PluginListenerHandle | undefined;
  void Network.addListener('networkStatusChange', ({ connected }) => {
    window.clearTimeout(settleTimer);
    if (!connected) {
      show();
      return;
    }
    // Android reports "connected" the moment an interface comes up, often
    // before it can actually route — give it a moment before reloading.
    settleTimer = window.setTimeout(() => void refresh(), RECONNECT_SETTLE_MS);
  }).then((listener) => {
    handle = listener;
  });

  void Network.getStatus()
    .then(({ connected }) => {
      if (!connected) show();
    })
    .catch(() => {});

  return () => {
    window.clearTimeout(settleTimer);
    void handle?.remove();
    hide();
  };
};
