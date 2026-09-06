import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from '@colorclash/test-fixtures';
import { precacheList, preparePage } from './build-pwa.js';

/**
 * The installable build's packaging step.
 *
 * `dist/pwa` is what Capacitor puts inside the APK, so a mistake here ships to
 * a store rather than to a browser tab. Two of them are silent: a root-absolute
 * asset path works perfectly on a web host and resolves to nothing inside a
 * WebView, and a precache list that misses a file leaves an "offline" app that
 * needs the network for exactly one thing.
 *
 * The Vite build itself runs in CI. This is the part that does not need it.
 */

const VITE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Color Clash</title>
<script type="module" crossorigin src="/assets/app-a1b2c3.js"></script>
<link rel="stylesheet" crossorigin href="/assets/app-d4e5f6.css">
<link rel="preconnect" href="https://fonts.googleapis.com" />
</head>
<body>
<div id="root"></div>
</body>
</html>`;

describe('PWA packaging — the page', () => {
  it('makes built asset paths relative so a WebView can find them', () => {
    // This is the failure that produces a black screen in an APK and works
    // perfectly on a web host, which is the worst combination to debug.
    const out = preparePage(VITE_HTML);
    expect(out.includes('src="./assets/app-a1b2c3.js"')).toBe(true);
    expect(out.includes('href="./assets/app-d4e5f6.css"')).toBe(true);
    expect(/(?:src|href)="\/[^/]/.test(out)).toBe(false);
  });

  it('leaves absolute URLs alone', () => {
    const out = preparePage(VITE_HTML);
    expect(out.includes('href="https://fonts.googleapis.com"')).toBe(true);
  });

  it('adds the manifest and the icon a browser needs to offer Install', () => {
    const out = preparePage(VITE_HTML);
    expect(out.includes('rel="manifest" href="manifest.webmanifest"')).toBe(true);
    expect(out.includes('apple-touch-icon')).toBe(true);
    expect(out.indexOf('manifest.webmanifest')).toBeLessThan(out.indexOf('</head>'));
  });

  it('registers the worker after load, inside the body', () => {
    const out = preparePage(VITE_HTML);
    expect(out.includes("navigator.serviceWorker.register('sw.js')")).toBe(true);
    expect(out.indexOf('serviceWorker')).toBeGreaterThan(out.indexOf('<body>'));
    // After load, so it never competes with first paint.
    expect(out.includes("addEventListener('load'")).toBe(true);
  });

  it('keeps the application markup untouched', () => {
    const out = preparePage(VITE_HTML);
    expect(out.includes('<div id="root"></div>')).toBe(true);
    expect(out.startsWith('<!doctype html>')).toBe(true);
  });

  it('refuses a document it cannot inject into', () => {
    expect(() => preparePage('<p>not a page</p>')).toThrow();
  });
});

describe('PWA packaging — the precache list', () => {
  const emitted = ['index.html', 'assets/app-a1b2c3.js', 'assets/app-d4e5f6.css', 'assets/logo.png'];

  it('caches every emitted file, so the install is genuinely offline', () => {
    const list = precacheList(emitted);
    for (const file of emitted) expect(list).toContain(`./${file}`);
  });

  it('caches the shell and the manifest icons too', () => {
    const list = precacheList(emitted);
    expect(list).toContain('./');
    expect(list).toContain('./manifest.webmanifest');
    expect(list).toContain('./icons/icon-192.png');
  });

  it('does not ask the browser to cache anything twice', () => {
    const list = precacheList([...emitted, 'index.html']);
    expect(new Set(list).size).toBe(list.length);
  });

  it('is what the worker actually reads', () => {
    // The worker has a token where the list goes; if that token is renamed on
    // one side only, the shipped worker is a syntax error and every install is
    // silently online-only.
    const sw = readFileSync(
      join(resolve(import.meta.dirname, '..'), 'apps/client/pwa/sw.js'),
      'utf8',
    );
    expect(sw.includes('__PRECACHE__')).toBe(true);
    expect(sw.includes('__BUILD_ID__')).toBe(true);
  });
});
