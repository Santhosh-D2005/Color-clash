/**
 * Builds `dist/pwa/` — the installable version of the game, and the folder
 * Capacitor copies into the APK as its web assets.
 *
 * It takes the **web build** — `apps/client/dist`, real hashed script, style
 * and image files — and adds the three things that make a browser treat a page
 * as an installable app: a web manifest, an icon set, and a registered service
 * worker.
 *
 * ## Why the web build and not the one-document build
 *
 * It used to package `dist/color-clash.offline.html`: a single 1.47 MB
 * document with React and 41 base64 images inside it. Everything in it had to
 * be parsed on every cold start, none of it could be cached separately, and an
 * update to one image invalidated the whole thing. Measured cold start to an
 * interactive menu was 2,050 ms against a page that had finished loading at
 * 135 ms.
 *
 * The web build already emits exactly what a WebView wants — a small document
 * that pulls hashed files the platform can cache individually and fetch in
 * parallel — so the installed app and the APK now ship that. The one-document
 * build still exists, for hosting the game as a single file; it is just no
 * longer what a player installs.
 *
 *   npm run build:pwa       # runs the web build first
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const HEAD = `<link rel="manifest" href="manifest.webmanifest" />
<link rel="apple-touch-icon" href="icons/apple-touch-180.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="mobile-web-app-capable" content="yes" />`;

const REGISTER = `<script>
// Registered after load so it never competes with first paint.
if ('serviceWorker' in navigator) {
  addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {
      // No worker means no offline cache — the game still runs normally.
    });
  });
}
</script>`;

/** Icons the manifest names, which must be cached whether or not a page uses them. */
const MANIFEST_ICONS = ['./icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'];

/**
 * Turns the web build's index.html into the installable app's index.html.
 *
 * Pure, and separated from the file handling so it can be tested without a
 * Vite install — see `build-pwa.test.ts`. Every mistake available here is one
 * that produces a folder that looks complete and a page that is blank inside a
 * WebView.
 */
export function preparePage(html: string): string {
  /*
   * Vite writes root-absolute references (`/assets/app-abc123.js`). A WebView
   * loads the app from a directory, not a domain root, so they are made
   * relative — which is also what lets the same folder be served from a
   * subpath.
   */
  let out = html.replace(/(\b(?:src|href)=")\/(?!\/)/g, '$1./');

  if (!out.includes('</head>') || !out.includes('</body>')) {
    throw new Error('The web build produced a document with no <head> or no <body>.');
  }
  out = out.replace('</head>', `${HEAD}\n</head>`);
  out = out.replace('</body>', `${REGISTER}\n</body>`);
  return out;
}

/**
 * What the service worker precaches.
 *
 * The list is what was actually emitted. Guessing it is how an installed app
 * ends up online-only for one hashed file nobody remembered to add — which is
 * the specific failure the previous hand-written shell list invited.
 */
export function precacheList(emitted: string[]): string[] {
  return [
    ...new Set([
      './',
      './manifest.webmanifest',
      ...emitted.map((f) => `./${f}`),
      ...MANIFEST_ICONS,
    ]),
  ];
}

/** Every file under `dir`, as paths relative to it. */
export function tree(dir: string, base = dir, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tree(full, base, out);
    else out.push(relative(base, full).split('\\').join('/'));
  }
  return out;
}

export function main(root = resolve(import.meta.dirname, '..')): void {
  const src = join(root, 'apps/client/pwa');
  const web = join(root, 'apps/client/dist');
  const out = join(root, 'dist/pwa');

  if (!existsSync(join(web, 'index.html'))) {
    console.error(`Missing ${join(web, 'index.html')}.\nRun \`npm run build:web\` first.`);
    process.exit(1);
  }

  /** Changing this evicts the previous cache on the next launch. */
  const buildId = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);

  mkdirSync(join(out, 'icons'), { recursive: true });

  /* ---- 1. the web build, copied as-is ---- */

  const emitted = tree(web);
  for (const file of emitted) {
    const dest = join(out, file);
    mkdirSync(join(dest, '..'), { recursive: true });
    copyFileSync(join(web, file), dest);
  }

  /* ---- 2. the page, with the manifest link and worker registration ---- */

  writeFileSync(join(out, 'index.html'), preparePage(readFileSync(join(web, 'index.html'), 'utf8')));

  /* ---- 3. manifest + worker ---- */

  copyFileSync(join(src, 'manifest.webmanifest'), join(out, 'manifest.webmanifest'));

  const precache = precacheList(emitted);
  const sw = readFileSync(join(src, 'sw.js'), 'utf8')
    .replace('__BUILD_ID__', buildId)
    .replace('__PRECACHE__', JSON.stringify(precache, null, 2));
  writeFileSync(join(out, 'sw.js'), sw);

  /* ---- 4. icons ---- */

  let icons = 0;
  for (const file of readdirSync(join(src, 'icons'))) {
    copyFileSync(join(src, 'icons', file), join(out, 'icons', file));
    icons += 1;
  }

  const bytes = tree(out).reduce((n, f) => n + statSync(join(out, f)).size, 0);
  const doc = statSync(join(out, 'index.html')).size;
  console.log(
    `Built ${out}\n` +
      `  index.html      ${(doc / 1024).toFixed(1)} kB — the document a cold start parses\n` +
      `  ${emitted.length} built files, ${icons} icons, ${(bytes / 1024 / 1024).toFixed(2)} MB total\n` +
      `  manifest + sw.js (build ${buildId}, ${precache.length} precached)\n\n` +
      'Serve that folder over http(s) and the browser will offer to install it.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
