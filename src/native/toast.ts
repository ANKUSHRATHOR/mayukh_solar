/**
 * A minimal shell-owned toast.
 *
 * The web app has its own toaster, but the native layer must be able to speak
 * before React has mounted (splash/offline paths) and without reaching into app
 * code, so this renders its own element and themes it from the same tokens.
 */
const ELEMENT_ID = 'native-shell-toast';

let hideTimer: number | undefined;

export const showToast = (message: string, durationMs = 2000): void => {
  let el = document.getElementById(ELEMENT_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = ELEMENT_ID;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    Object.assign(el.style, {
      position: 'fixed',
      left: '50%',
      bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
      transform: 'translateX(-50%)',
      zIndex: '2147483646',
      maxWidth: 'calc(100vw - 32px)',
      padding: '10px 16px',
      borderRadius: '9999px',
      font: '500 14px/1.4 system-ui, -apple-system, sans-serif',
      background: 'hsl(var(--foreground, 222 47% 11%))',
      color: 'hsl(var(--background, 210 20% 98%))',
      boxShadow: '0 8px 24px rgb(0 0 0 / 0.18)',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 150ms ease',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(el);
  }

  el.textContent = message;
  requestAnimationFrame(() => {
    el!.style.opacity = '1';
  });

  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    el!.style.opacity = '0';
  }, durationMs);
};
