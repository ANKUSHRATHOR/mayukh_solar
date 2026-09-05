/**
 * Baseline screenshot capture.
 *
 * Captures every route at 4 widths × 2 themes into /baselines, so later visual
 * diffs (token changes, spacing fixes) run against a known-good reference.
 *
 * Auth: the app is entirely behind ProtectedRoute, so a real session is
 * required. Run `--login` once; a headed browser opens, you sign in, and the
 * session is saved to .auth/state.json (gitignored — never commit it).
 *
 *   node scripts/capture-baselines.mjs --login     # once, interactive
 *   node scripts/capture-baselines.mjs             # capture
 *   node scripts/capture-baselines.mjs --widths 375,1280   # subset
 *
 * Assumes the dev server is already running (npm run dev / preview_start).
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:5199';
const OUT = 'baselines';
const AUTH = '.auth/state.json';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const WIDTHS = arg('widths', '375,768,1280,1920').split(',').map(Number);
const THEMES = ['light', 'dark'];

/** Static routes. Parameterised ones are resolved at runtime from list pages. */
const STATIC_ROUTES = [
  '/login', '/set-password', '/install',
  '/',
  '/users', '/users/new', '/users/reset-logs',
  '/leads', '/leads/new', '/leads/bin',
  '/projects', '/projects/new',
  '/admin/projects',
  '/deals', '/visits', '/field-visit', '/tasks',
  '/activity-logs', '/settings', '/admin/settings',
  '/attendance', '/my-attendance', '/admin/attendance', '/admin/salary',
  '/admin/performance', '/profile', '/k-lookup', '/contacts',
];

/**
 * Detail routes need a real record id. Each entry visits a list page and takes
 * the first matching link, so the baseline covers a populated detail screen
 * rather than a not-found state.
 */
const DETAIL_ROUTES = [
  { list: '/leads', match: /^\/leads\/[0-9a-f-]{36}$/ },
  { list: '/projects', match: /^\/projects\/[0-9a-f-]{36}$/ },
  { list: '/visits', match: /^\/visits\/[0-9a-f-]{36}$/ },
  { list: '/users', match: /^\/users\/[0-9a-f-]{36}$/ },
];

const slug = (r) => (r === '/' ? 'root' : r.replace(/^\//, '').replace(/\//g, '_'));
const exists = (p) => access(p).then(() => true, () => false);

async function login() {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  console.log('\n  Sign in in the browser window, wait until the dashboard loads,');
  console.log('  then press Enter here.\n');
  await new Promise((r) => process.stdin.once('data', r));
  await mkdir('.auth', { recursive: true });
  await ctx.storageState({ path: AUTH });
  console.log(`  Saved ${AUTH}`);
  await browser.close();
}

async function resolveDetailRoutes(page) {
  const found = [];
  for (const { list, match } of DETAIL_ROUTES) {
    try {
      await page.goto(`${BASE}${list}`, { waitUntil: 'networkidle' });
      const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
      const hit = hrefs.find((h) => h && match.test(h));
      if (hit) found.push(hit);
      else console.warn(`  ! no detail row found on ${list} — skipping that route`);
    } catch (e) {
      console.warn(`  ! ${list} failed: ${e.message}`);
    }
  }
  return found;
}

/**
 * Dynamic content makes diffs noisy. Freeze the clock and hide the elements
 * that change every run, so a later diff shows design changes only.
 */
const STABILISE = `
  [data-baseline-hide], time, .animate-spin { visibility: hidden !important; }
  *, *::before, *::after {
    animation-duration: 0s !important; animation-delay: 0s !important;
    transition-duration: 0s !important; transition-delay: 0s !important;
  }
  ::-webkit-scrollbar { display: none !important; }
`;

async function main() {
  if (process.argv.includes('--login')) return login();

  if (!(await exists(AUTH))) {
    console.error(`\n  Missing ${AUTH}. Run:  node scripts/capture-baselines.mjs --login\n`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: AUTH });
  ctx.setDefaultTimeout(20000);
  const probe = await ctx.newPage();

  console.log('Resolving detail routes…');
  const routes = [...STATIC_ROUTES, ...(await resolveDetailRoutes(probe))];
  await probe.close();

  const manifest = [];
  let n = 0;
  const total = routes.length * WIDTHS.length * THEMES.length;

  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      const page = await ctx.newPage();
      await page.setViewportSize({ width, height: 900 });
      await page.addStyleTag({ content: STABILISE }).catch(() => {});
      // next-themes reads this key; set before first paint of each route.
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);

      for (const route of routes) {
        n++;
        const file = path.join(OUT, theme, String(width), `${slug(route)}.png`);
        try {
          await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
          await page.addStyleTag({ content: STABILISE }).catch(() => {});
          await page.waitForTimeout(400);
          await mkdir(path.dirname(file), { recursive: true });
          await page.screenshot({ path: file, fullPage: true });
          manifest.push({ route, theme, width, file, ok: true });
          process.stdout.write(`\r  ${n}/${total}  ${theme} ${width} ${route}`.padEnd(78));
        } catch (e) {
          manifest.push({ route, theme, width, file, ok: false, error: e.message });
          console.warn(`\n  ! ${theme} ${width} ${route}: ${e.message}`);
        }
      }
      await page.close();
    }
  }

  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const failed = manifest.filter((m) => !m.ok).length;
  console.log(`\n\nDone. ${manifest.length - failed} captured, ${failed} failed.`);
  console.log(`Manifest: ${OUT}/manifest.json`);
  await browser.close();
}

main();
