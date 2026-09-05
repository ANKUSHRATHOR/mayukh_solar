/**
 * Reads the app's own design tokens out of the live document so native chrome
 * (status bar, offline overlay) matches whatever `src/index.css` defines,
 * rather than hardcoding a second copy of the palette.
 */

/** Fallbacks used before the stylesheet has applied, or in the error page. */
const FALLBACK = { light: '#f8fafb', dark: '#0d1626' } as const;

export const isDarkTheme = (): boolean =>
  document.documentElement.classList.contains('dark');

/** Resolve an `hsl(H S% L%)` custom property to a `#rrggbb` string. */
export const tokenToHex = (token: string, fallback: string): string => {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  const parts = raw.replace(/%/g, '').split(/\s+/).map(Number);
  if (parts.length < 3 || parts.some(Number.isNaN)) return fallback;

  const [h, s, l] = [parts[0], parts[1] / 100, parts[2] / 100];
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(((h % 360) + 360) % 360 / 60);
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg];
  const to255 = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to255(r)}${to255(g)}${to255(b)}`;
};

/** The current `--background`, as a hex colour the native layer can use. */
export const backgroundHex = (): string =>
  tokenToHex('--background', isDarkTheme() ? FALLBACK.dark : FALLBACK.light);

/**
 * Runs `onChange` whenever the theme class on <html> flips. next-themes toggles
 * that class, so this covers both the user's choice and system changes.
 */
export const watchTheme = (onChange: () => void): (() => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => observer.disconnect();
};
