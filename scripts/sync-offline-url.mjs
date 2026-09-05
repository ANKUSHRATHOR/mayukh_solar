#!/usr/bin/env node
/**
 * Injects the selected environment's URL into the built offline fallback page.
 *
 * `public/offline.html` is served by the Capacitor shell from the bundled
 * webDir when the remote origin is unreachable, so at that point the WebView is
 * sitting on a local `capacitor://` URL — reloading would just re-render the
 * error page. It needs the real app URL baked in to navigate back.
 *
 * Runs as part of `npm run cap:sync`, after `vite build` and before `cap sync`.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const environments = JSON.parse(
  readFileSync(join(root, 'capacitor.environments.json'), 'utf8'),
);

const envName = process.env.CAP_ENV ?? 'production';
if (!(envName in environments)) {
  throw new Error(
    `Unknown CAP_ENV "${envName}". Expected one of: ${Object.keys(environments).join(', ')}`,
  );
}

const url = process.env.CAP_SERVER_URL ?? environments[envName];
if (url.includes('REPLACE-ME')) {
  throw new Error(
    `The "${envName}" URL in capacitor.environments.json is still a placeholder.`,
  );
}

const target = join(root, 'dist', 'offline.html');
if (!existsSync(target)) {
  throw new Error(`${target} not found — run \`npm run build\` first.`);
}

const html = readFileSync(target, 'utf8');
if (!html.includes('__CAP_SERVER_URL__')) {
  // Already substituted by an earlier run against a stale dist; rebuild.
  throw new Error(
    'dist/offline.html has no __CAP_SERVER_URL__ placeholder — rebuild with `npm run build`.',
  );
}

writeFileSync(target, html.replaceAll('__CAP_SERVER_URL__', url));
console.log(`offline.html → ${url}  (CAP_ENV=${envName})`);
