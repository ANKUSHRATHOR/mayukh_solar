import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';

import { nativePlatform } from './platform';
import { showToast } from './toast';

/**
 * Routes where "back" means "leave the app" rather than "go up a level".
 * `/` is the role router and `/login` / `/set-password` are the entry screens —
 * from any of them there is nowhere sensible left to go. `/install` is
 * deliberately not here: it is reached *from* login, so back should return.
 */
const ROOT_ROUTES = new Set(['/', '/login', '/set-password']);

const DOUBLE_PRESS_WINDOW_MS = 2000;

/**
 * Radix (dialogs, sheets, dropdowns, popovers) closes on Escape, so dispatching
 * one dismisses the topmost layer without this file having to know about any of
 * the app's components. Returns true when something was actually open —
 * hardware back should consume the press rather than also navigating.
 */
const dismissTopLayer = (): boolean => {
  const open = document.querySelector(
    '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-state="open"][role="menu"], [data-state="open"][role="listbox"], [data-radix-popper-content-wrapper] [data-state="open"]',
  );
  if (!open) return false;

  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  return true;
};

const isRootRoute = (): boolean => ROOT_ROUTES.has(window.location.pathname);

export const initBackButton = (): (() => void) => {
  // iOS has no hardware back button; the swipe gesture is handled by WKWebView.
  if (nativePlatform() !== 'android') return () => {};

  let lastPressAt = 0;
  let handle: PluginListenerHandle | undefined;

  void App.addListener('backButton', ({ canGoBack }) => {
    if (dismissTopLayer()) return;

    if (!isRootRoute() && canGoBack) {
      window.history.back();
      return;
    }

    // On a root route (or with an empty history stack) a single press must not
    // drop the user out of the app mid-task — require a confirming second one.
    const now = Date.now();
    if (now - lastPressAt < DOUBLE_PRESS_WINDOW_MS) {
      void App.exitApp();
      return;
    }
    lastPressAt = now;
    showToast('Press back again to exit');
  }).then((listener) => {
    handle = listener;
  });

  return () => {
    void handle?.remove();
  };
};
