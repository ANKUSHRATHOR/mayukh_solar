import { Style, StatusBar } from '@capacitor/status-bar';

import { nativePlatform } from './platform';
import { backgroundHex, isDarkTheme, watchTheme } from './theme';

/**
 * Keeps the status bar in step with the app's light/dark theme.
 *
 * Capacitor's naming is the opposite of what it reads like: `Style.Light` means
 * *dark* content on a light bar, `Style.Dark` means light content on a dark bar.
 */
const apply = async () => {
  const dark = isDarkTheme();
  try {
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    // setBackgroundColor is Android-only; iOS takes the colour from the
    // WebView's own background because the bar is not overlaid.
    if (nativePlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: backgroundHex() });
      await StatusBar.setOverlaysWebView({ overlay: false });
    }
  } catch {
    // Plugin unavailable (e.g. an older shell) — chrome styling is cosmetic.
  }
};

export const initStatusBar = (): (() => void) => {
  void apply();
  return watchTheme(() => void apply());
};
