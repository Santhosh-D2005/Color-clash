/**
 * A static file server for `dist/pwa`, used by the browser tests and handy for
 * checking the installable build by hand.
 *
 * Zero dependencies, like everything else in tools/. It exists because the
 * tests were originally pointed at the built file over `file://`, and a
 * file:// page has an opaque origin: `localStorage` is unavailable there, so a
 * spec for "the sound preference persists" could never pass, and a spec for the
 * service worker could never run at all. Serving over http tests the thing
 * players actually load.
 *
 *   node tools/serve-dist.mjs [port] [dir]
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';

const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
const root = resolve(process.argv[3] ?? join(import.meta.dirname, '../dist/pwa'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  // Normalise before joining: a path with `..` in it must not escape the root.
  const requested = normalize(url === '/' ? '/index.html' : url);
  const file = join(root, requested);

  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    const index = join(root, 'index.html');
    if (existsSync(index)) {
      res.writeHead(200, { 'Content-Type': TYPES['.html'] });
      res.end(readFileSync(index));
      return;
    }
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    // No caching: a test run must never see the previous build.
    'Cache-Control': 'no-store',
  });
  res.end(readFileSync(file));
}).listen(port, () => {
  console.log(`Serving ${root} on http://127.0.0.1:${port}`);
});
