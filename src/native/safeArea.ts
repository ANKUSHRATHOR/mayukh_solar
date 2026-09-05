/**
 * Publishes the device safe-area insets as CSS custom properties.
 *
 * The shell deliberately does not use `viewport-fit=cover`, so the platform
 * already keeps the page clear of the notch and the gesture bar and nothing in
 * the existing layout can be clipped. These variables exist so that layout work
 * which *does* want to draw edge-to-edge has real numbers to use, and so a
 * future switch to cover mode is a CSS change rather than a rewrite.
 */
const PROPS = ['top', 'right', 'bottom', 'left'] as const;

export const initSafeArea = (): (() => void) => {
  const publish = () => {
    const root = document.documentElement;
    for (const side of PROPS) {
      root.style.setProperty(
        `--safe-area-inset-${side}`,
        `env(safe-area-inset-${side}, 0px)`,
      );
    }
  };

  publish();
  window.addEventListener('resize', publish);
  window.addEventListener('orientationchange', publish);
  return () => {
    window.removeEventListener('resize', publish);
    window.removeEventListener('orientationchange', publish);
  };
};
