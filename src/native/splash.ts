import { SplashScreen } from '@capacitor/splash-screen';

/**
 * The splash is configured with `launchAutoHide: false` so it covers the whole
 * remote page load, not just a fixed timer. Hide it once the app has actually
 * put something on screen — or after a hard cap, so a hung load still shows the
 * user *something* (the offline overlay, or a stuck page they can report).
 */
const HARD_CAP_MS = 10_000;

export const initSplash = (): (() => void) => {
  let done = false;
  const hide = () => {
    if (done) return;
    done = true;
    void SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {});
  };

  const root = document.getElementById('root');
  if (root?.childElementCount) {
    // Already painted (hot reload, or a very fast load).
    requestAnimationFrame(hide);
    return () => {};
  }

  const observer = new MutationObserver(() => {
    if (!root?.childElementCount) return;
    observer.disconnect();
    // One extra frame so the first paint lands before the splash fades.
    requestAnimationFrame(() => requestAnimationFrame(hide));
  });
  if (root) observer.observe(root, { childList: true });

  const cap = window.setTimeout(() => {
    observer.disconnect();
    hide();
  }, HARD_CAP_MS);

  return () => {
    observer.disconnect();
    window.clearTimeout(cap);
    hide();
  };
};
